export type posts = {title: string, content: string, id?: any, created_at: Date, updated_at: Date}
export type users = {name: string, email: string, id?: any, created_at: Date, updated_at: Date}
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

    var RequestData: Request  & { 
        params: {
            [key: string]: any
        }
    }
}
