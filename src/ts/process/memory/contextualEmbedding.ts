import { globalFetch } from "src/ts/globalApi.svelte";
import { getDatabase } from "src/ts/storage/database.svelte";
import { contextHash, type VectorArray } from "./hypamemory";

export interface ContextualEmbeddingProvider {
  readonly modelId: string;
  embedDocumentGroups(groups: string[][]): Promise<VectorArray[][]>;
  embedQueries(queries: string[]): Promise<VectorArray[]>;
  getCacheKeySuffix(contextTexts?: string[]): string;
}

export function isContextModel(model: string): boolean {
  return model === 'voyageContext3' || model === 'voyageContext4';
}

export function getContextProvider(model: string): ContextualEmbeddingProvider | null {
  switch (model) {
    case 'voyageContext3':
      return new VoyageContextProvider('voyage-context-3', 'voyageContext3');
    case 'voyageContext4':
      return new VoyageContextProvider('voyage-context-4', 'voyageContext4');
    default:
      return null;
  }
}

const VOYAGE_API_URL = "https://api.voyageai.com/v1/contextualizedembeddings";
const MAX_CHUNKS_PER_REQUEST = 16000;
const MAX_INPUTS_PER_REQUEST = 1000;
const RETRY_TARGET_TOKENS = 110000;

class VoyageContextProvider implements ContextualEmbeddingProvider {
  constructor(
    readonly modelId: 'voyage-context-3' | 'voyage-context-4',
    private readonly cacheKeyModel: 'voyageContext3' | 'voyageContext4'
  ) {}

  private getApiKey(): string {
    const db = getDatabase();
    const apiKey = db.voyageApiKey?.trim();
    if (!apiKey) {
      throw new Error(`${this.modelId} requires a Voyage API Key`);
    }
    return apiKey;
  }

  async embedDocumentGroups(groups: string[][]): Promise<VectorArray[][]> {
    const batches = this.batchGroups(groups);
    const allResults: VectorArray[][] = new Array(groups.length);

    let groupOffset = 0;
    for (const batch of batches) {
      const batchResults = await this.embedBatchWithRetry(batch, 'document');
      for (let i = 0; i < batchResults.length; i++) {
        allResults[groupOffset + i] = batchResults[i];
      }

      groupOffset += batch.length;
    }

    return allResults;
  }

  async embedQueries(queries: string[]): Promise<VectorArray[]> {
    const results = await this.embedBatchWithRetry(
      queries.map((query) => [query]),
      'query'
    );
    return results.map((group) => group[0]);
  }

  getCacheKeySuffix(contextTexts?: string[]): string {
    const ctxPart = contextTexts && contextTexts.length > 1
      ? `|ctx:${contextHash(contextTexts)}`
      : '';
    return `|${this.cacheKeyModel}${ctxPart}`;
  }

  private batchGroups(groups: string[][]): string[][][] {
    const batches: string[][][] = [];
    let currentBatch: string[][] = [];
    let currentChunkCount = 0;

    for (const group of groups) {
      if (
        currentBatch.length > 0 &&
        (currentBatch.length + 1 > MAX_INPUTS_PER_REQUEST ||
         currentChunkCount + group.length > MAX_CHUNKS_PER_REQUEST)
      ) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChunkCount = 0;
      }
      currentBatch.push(group);
      currentChunkCount += group.length;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async embedBatchWithRetry(
    groups: string[][],
    inputType: 'document' | 'query'
  ): Promise<VectorArray[][]> {
    const response = await globalFetch(VOYAGE_API_URL, {
      logCategory: 'embedding',
      logSource: 'memory',
      headers: {
        "Authorization": "Bearer " + this.getApiKey(),
        "Content-Type": "application/json"
      },
      body: {
        "model": this.modelId,
        "inputs": groups,
        "input_type": inputType
      }
    });

    if (response.ok && response.data?.data) {
      return response.data.data.map(
        (group: { data: { embedding: VectorArray }[] }) =>
          group.data.map((item) => item.embedding)
      );
    }

    if (!this.isTooManyTokensError(response.data)) {
      throw new Error(JSON.stringify(response.data));
    }

    // Voyage limits each submitted batch to 120K tokens. Token counts are not
    // available locally, so use the count in the API error to jump directly to
    // roughly 110K-token pieces instead of repeatedly failing by halving.
    const reportedTokens = this.getReportedBatchTokens(response.data);
    if (groups.length > 1) {
      const partCount = Math.min(
        groups.length,
        Math.max(2, reportedTokens ? Math.ceil(reportedTokens / RETRY_TARGET_TOKENS) : 2)
      );
      const results: VectorArray[][] = [];
      for (const part of this.splitEvenly(groups, partCount)) {
        results.push(...await this.embedBatchWithRetry(part, inputType));
      }
      return results;
    }

    const group = groups[0];
    if (group.length > 1) {
      const partCount = Math.min(
        group.length,
        Math.max(2, reportedTokens ? Math.ceil(reportedTokens / RETRY_TARGET_TOKENS) : 2)
      );
      const embeddings: VectorArray[] = [];
      for (const part of this.splitEvenly(group, partCount)) {
        const result = await this.embedBatchWithRetry([part], inputType);
        embeddings.push(...result[0]);
      }
      return [embeddings];
    }

    throw new Error(
      `A single input exceeds the ${this.modelId} 120000-token batch limit.`
    );
  }

  private isTooManyTokensError(data: any): boolean {
    return data?.error_code === 'TOO_MANY_TOKENS_IN_BATCH' ||
      (typeof data?.detail === 'string' && data.detail.includes('max allowed tokens per submitted batch'));
  }

  private getReportedBatchTokens(data: any): number | null {
    const detail = typeof data?.detail === 'string' ? data.detail : '';
    const match = detail.match(/batch has ([\d,]+) tokens/i);
    if (!match) return null;
    const tokens = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(tokens) && tokens > 0 ? tokens : null;
  }

  private splitEvenly<T>(items: T[], partCount: number): T[][] {
    const parts: T[][] = [];
    for (let i = 0; i < partCount; i++) {
      const start = Math.floor(i * items.length / partCount);
      const end = Math.floor((i + 1) * items.length / partCount);
      if (end > start) parts.push(items.slice(start, end));
    }
    return parts;
  }
}
