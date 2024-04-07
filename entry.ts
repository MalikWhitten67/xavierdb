import fs from "fs"; 
import crud from "./CRUD" 
if(!fs.existsSync(process.cwd() + '/data')){
    fs.mkdirSync(process.cwd() + '/data')
}
if(!fs.existsSync(process.cwd() + '/data/db.sqlite')){
    fs.writeFileSync(process.cwd() + '/data/db.sqlite', '')
}
if(!process.env.HTTP_REQUEST_PORT){
    console.error("HTTP_REQUEST_PORT environment variable is required")
    process.exit(1)
}
if(!fs.existsSync(process.cwd() + '/config.ts')){
    console.error("config.ts file is required")
    process.exit(1) 
}
if(!fs.existsSync(process.cwd() + '/routes')){
    console.error("routes directory is required")
    process.exit(1) 
}  

globalThis.crud = crud
const config = await import(process.cwd() + '/config.ts').then((mod) => mod.default) as any
// generate types from config
var types = config.collections.map((collection) => {
    let keys = Object.keys(collection.$.fields)
    let required = collection.$.required || []
    let fields = keys.map((key) => {
        let type = collection.$.fields[key].toLowerCase()
        switch(true){
         case type === "text":
            type = "string"
            break;
        case type === "integer":
            type = "number"
            break;
        case type === "real":
            type = "number"
            break;
        case type === "date":
            type = "Date"
            break;
        case type === "blob":
            type = "ArrayBuffer"
            break;
        default:
            type = "any"
            break;
        }
        if(key === "created_at") return `${key}: Date`
        if(key === "updated_at") return `${key}: Date`
        return `${key}${required.includes(key) ? "" : "?"}: ${type}`
    }).join(", ")
    return `export type ${collection.$.name} = {${fields}}`
})

types = types.join("\n") as any;
types += `
declare global {
    var crud: {
        schema(data: any): {
            $: {
                name:  string,
                required:  any[],
                fields:  any
             },
            insertOne: (data: any) => {
                id: any,
                created_at: Date,
                updated_at: Date, 
                [key: string]: any
            }
            match: (query: Object) =>  [{
                id: any,
                created_at: Date,
                updated_at: Date, 
                [key: string]: any
            }]
            update: (id: string, data: any) =>  {
                id: any,
                created_at: Date,
                updated_at: Date, 
                [key: string]: any
            }
            findOne: (id: string) =>  {
                id: any,
                created_at: Date,
                updated_at: Date,
                [key: string]: any
            }
            getAll: () => [{
                id: any,
                created_at: Date,
                updated_at: Date,
                [key: string]: any
            }]
            delete: (id: string) => any
        };
        sync(): void
        collections: any[] 
    }
}
`

fs.mkdirSync(process.cwd() + '/types', {recursive:true})
fs.writeFileSync(process.cwd() + '/types/types.ts', types)
globalThis.crud = crud
export const bc = new BroadcastChannel("crud")
import { responseCodes } from "./enums/http_response_codes"

const routes = new Bun.FileSystemRouter({
    style:'nextjs',
    dir: process.cwd() + '/routes'
})
const wsClients = new Set()
bc.onmessage = (e) => {  
    wsClients.forEach((ws) => {
        ws.send(JSON.stringify(e.data))
    })
}
export default{
    port: process.env.HTTP_REQUEST_PORT || 3000, 
    websocket: {
        async open(ws){ 
            ws.send("connected")
        },
        async message(ws){
            wsClients.delete(ws)
        },
        async close(ws){
            wsClients.delete(ws)
        }
    },
    async fetch(req, res){ 
         let url = new URL(req.url)
         
        if(res.upgrade(req) && url.pathname === '/ws/realtime'){
            return new Response(null, {status:101})
         }
         let path = url.pathname
         let route = routes.match(path)
          
         try {
            if(route){
                let mod = await import(route.filePath)
                if(!mod.default){ return new Response("404 Not Found", {status:responseCodes.notfound}) } 
                if(req.method.toLowerCase() !== mod.default.name.toLowerCase()){ return new Response("405 Method Not Allowed", {status:responseCodes.methodnotallowed}) }
                req.params = route.params || {}
                let response = await mod.default(req)
                return response
               }else{
                  return new Response("404 Not Found", {status:responseCodes.notfound})
            }
         } catch (error) {
            console.error(error)
            if(process.env.LOG_DIR && process.env.LOG_LEVEL === "error"){
                let logs  = fs.createWriteStream(process.env.LOG_DIR + '/error.log', {flags: 'a'})
                logs.write(error + "\n")
                logs.close()
            }
            return new Response("500 Internal Server Error", {status:responseCodes.internalservererror})
         }
    }
}
console.log(`Server is running on port ${process.env.HTTP_REQUEST_PORT}`)