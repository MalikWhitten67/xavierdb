//@ts-nocheck
import { Glob } from "bun";

const glob = new Glob("*.cbf");
async function transpile(file: string) {
  let contents = await Bun.file(file).text();
  contents = contents.replace(/\s/g, "");
  const collections = [] as any;
  const relations = [] as any;
  for (var i = 0; i < contents.length; i++) {
    // lets start by getting all collections
    if (contents[i] === "c") {
      let isCollection = contents.slice(i, i + 10) === "collection";
      i = i + 10;
      if (isCollection) {
        let name = "";
        while (contents[i] !== "{") {
          name += contents[i];
          i++;
        }
        let start = i;
        while (contents[i] !== "}") {
          i++;
        }
        let end = i + 2;
        let collection = contents.slice(start + 1, end - 1);
        let fields = {};
        let colon_count = collection.split(":").length - 1;
        let authenticated = false;
        let comma_count = collection.split(",").length - 1;
        if (colon_count !== comma_count) {
          throw new Error("Expected a comma after a colon");
        }
        let fieldsArr = collection.split(",");
        let requiredArray = [] as any;
        for (var f in fieldsArr) {
          if (fieldsArr[f] == " " || fieldsArr[f] == "}") continue;
          let field = fieldsArr[f];
          let colonIndex = field.indexOf(":");
          let fieldName = field.slice(0, colonIndex);
          let fieldType = field.slice(colonIndex + 1, field.length);
          if (fieldType.toLowerCase().includes("required")) {
            requiredArray.push(fieldName);
            fieldType = fieldType
              .replace("required", "")
              .replace("(", "")
              .replace(")", "")
              .replace("&", "")
              .replace("?", "")
              .replace("!", "")
              .replace(" ", "");
          }
          if (fieldName.toLocaleLowerCase() === "@auth") {
            authenticated = true;
            continue;
          }
          fields[fieldName] = fieldType;
        }
        collections.push({
          name,
          fields,
          required: requiredArray,
          auth: authenticated,
          relations: [],
        });
      }
    }

    if (contents[i] == "@") {
      let isRelation = contents.slice(i, i + 9) === "@relation";
      if (isRelation) {
        i = i + 9;
        let endBracketCount = 0;
        while (contents[i] !== "{") {
          i++;
        }

        let start = i + 1;
        while (true) {
          if (contents[i] === "{") {
            endBracketCount++;
          } else if (
            contents[i] === "}" &&
            contents[i + 1] === "e" &&
            contents[i + 2] === "n" &&
            contents[i + 3] === "d"
          ) {
            break;
          } else if (i === contents.length - 1) {
            throw new Error(`Expected an end statement but got ${contents[i]}`);
          }
          i++;
        }

        let end = i + 1;
        end = end - 1;
        let relation = contents.slice(start, end);
        let relationCount = relation.split("->").length - 1;
        let commaCount = relation.split(",").length - 1;
        if (relationCount !== commaCount) {
          throw new Error("Expected a comma after a relation");
        }
        let relationsArr = relation.split(",");
        relationsArr = relationsArr.filter((rel) => rel !== " " && rel !== ""); 
        for (var r in relationsArr) {
          let rel = relationsArr[r];
          if (rel == " " || rel == "}") continue;
          if (!rel.split("using")[1]) {
            throw new Error(
              "Must use the using keyword to define what the relation is linked to for" +
                rel
            );
          }
          let collection = rel.split(":")[0].replace(" ", ""); 
          let using = rel.split(":")[1].replace(" ", "").split("->")[0];
          let relatedValue = rel.split("using")[1];
          let relatedCollection = rel
            .split("->")[1]
            .split("using")[0]
            .replace(" ", "");
          if (!relations[collection]) {
            relations[collection] = {};
          } 
          relations.push({
            [collection]: {
              using,
              relatedCollection,
              relatedValue,
            },
          }); 
        }
      }
    }
  }

  return { collections, relations };
}
for await (const file of glob.scanSync({ absolute: true })) {
  let contents = await transpile(file);
  for (var r in contents.relations) {
    let relation = contents.relations[r];
    let collections = Object.keys(relation); 
    for(var i in collections){
       let collection = collections[i];
       let relatedCollection = relation[collection].relatedCollection;  
       if(collection === relatedCollection){
          throw new Error("A collection cannot be related to itself");
       }
       // tie to the collection
       for(var c in contents.collections){
           let coll = contents.collections[c];
           if(coll.name === collection){
              coll.relations.push(relation[collection]);
           }
       }
  }

  }
   
  delete contents.relations;
  await Bun.write(
    process.cwd() + "/schema/schema.json",
    JSON.stringify(contents, null, 2)
  );
}
