type authResponse = {
    id: any,
    created_at: Date,
    updated_at: Date, 
    error: null | string, 
    token: string,
    [key: string]: any
}
  
export class Xavier{
    database_url: string
    ws: WebSocket
    realtime_enabled: boolean = false
    realtime: {
        enable: () => boolean
    }

    authData: authResponse
   
    constructor(database_url: string){
        this.database_url = database_url   
        this.realtime = {
            enable: () => {
                this.realtime_enabled = true
                return true
            }
        } 
        
        this.authData = {} as any
    }

    on = (event: string, callback: (data: any) => void) => { 
        if(!this.ws){
            
        let ws = new WebSocket(this.database_url.replace("http", "ws") + "/ws/realtime") 
            this.ws = ws
        }

        this.ws.addEventListener("message", (wsdata) => {
            let data = JSON.parse(wsdata.data)
            if(data.event === event){
                callback(data)
            }
        })

    
    }
    collection = (name: string) => { 
        return {
            insertOne:  async (data: any) => {
                let response = await fetch(this.database_url + "/collection/" + name + "/insertOne", {
                    method: "POST",
                    body: JSON.stringify(data),
                    headers: {
                        "Content-Type": "application/json"
                    }
                })
                let json = await response.json()
                if(json.error){ 
                    let error = new Error(json.error)
                    error.message = json.error
                    throw error
                }
                return await json as {
                    id: any,
                    created_at: Date,
                    updated_at: Date, 
                    [key: string]: any
                }
            } ,
            getAll:  async () => {
                let response = await fetch(this.database_url + "/collection/" + name + "/getAll", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(this.authData?.token ? {Authorization: "Bearer " + this.authData.token} : {})
                    } 
                })  
                if(response.status === 401){
                   let e = {
                          message: "Unauthorized",
                          name: "Unauthorized",
                          code: 401
                     
                   }
                     throw e
                }
                return await response.json() as any[]
            } ,
            authWithPassword: async (email: string, password: string) => {
                let response = await fetch(this.database_url + "/collection/" + name + "/authWithPassword", {
                    method: "POST",
                    body: JSON.stringify({email, password}),
                    headers: {
                        "Content-Type": "application/json"
                    }
                })
                let data = await response.json() as authResponse
                if(data.error){
                    throw new Error(data.error)
                }
                if(response.status === 401){
                    throw new Error("Unauthorized")
                } 
                this.authData = data
                return this.authData
            } ,
            getOne: async (id: string, options: {expand:{}}) => {
              try {
                let response = await fetch(this.database_url + "/collection/" + name + "/getOne", {
                    method: "POST",
                    body: JSON.stringify({id, options}),
                    headers: {
                        "Content-Type": "application/json",
                        ...(this.authData?.token ? {Authorization: "Bearer " + this.authData.token} : {})
                        
                    }
                })
                return await response.json() 
              }
                catch (e) {
                    console.log(e)
                }
            } ,
            match: async (query: any) => {
                let response = await fetch(this.database_url + "/collection/" + name + "/match", {
                    method: "POST",
                    body: JSON.stringify(query),
                    headers: {
                        "Content-Type": "application/json"
                    }
                })
                return await response.json() as any[]
            },
            update: async (id: string, data: any) => {
                let response = await fetch(this.database_url + "/collection/" + name + "/update", {
                    method: "POST",
                    body: JSON.stringify({id, data}),
                    headers: {
                        "Content-Type": "application/json",
                        ...(this.authData?.token ? {Authorization: "Bearer " + this.authData.token} : {})
                    }
                }) 
                let json = await response.json() 
                if(response.status === 401){ 
                    let error =  json.error 
                    let e =  {
                        message:error,
                        name: "Unauthorized",
                        code: 401
                    }
                    throw e
                }
                return json as {
                    id: any,
                    created_at: Date,
                    updated_at: Date, 
                    [key: string]: any
                }
            },
            delete: async (id: string) => {
                let response = await fetch(this.database_url + "/collection/" + name + "/delete", {
                    method: "POST",
                    body: JSON.stringify({id}),
                    headers: {
                        "Content-Type": "application/json",
                        ...(this.authData?.token ? {Authorization: "Bearer " + this.authData.token} : {})
                    }
                })
                let json = await response.json()
                if(response.status === 401){ 
                    let error =  json.error 
                    let e =  {
                        message:error,
                        name: "Unauthorized",
                        code: 401
                    }
                    throw e
                }
                return json
            }
        }
    }
}