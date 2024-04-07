export default {
    collections: [
        crud.schema({
            name: "posts",
            required: ["title", "content"],
            fields: {
              title: "TEXT",
              content: "TEXT",   
            },
        }),
        crud.schema({
            name: "users",
            required: ["name", "email"],
            fields: {
              name: "TEXT",
              email: "TEXT",   
            },
        }),
    ]
}