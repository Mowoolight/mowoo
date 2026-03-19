import { NodeStorage } from "./nodeStorage"

export class AutoStorage{
    isAccount:boolean = false

    realStorage:NodeStorage

    async setItem(key:string, value:Uint8Array):Promise<string|null> {
        await this.realStorage.setItem(key, value)
        return null
    }
    async getItem(key:string):Promise<Buffer> {
        return await this.realStorage.getItem(key)
    }
    async keys():Promise<string[]>{
        return await this.realStorage.keys()
    }
    async removeItem(key:string){
        return await this.realStorage.removeItem(key)
    }

    async checkAccountSync(){
        return false
    }

    async Init(){
        if(!this.realStorage){
            console.log("using node storage")
            this.realStorage = new NodeStorage()
        }
    }

    async createAuth(): Promise<string> {
        if (!this.realStorage) {
            this.realStorage = new NodeStorage()
        }
        return this.realStorage.createAuth()
    }

    listItem = this.keys
}
