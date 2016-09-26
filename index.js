import fs from 'fs'
import R from 'ramda'
import minimist from 'minimist'
import handlebars from 'handlebars'
import { singularize } from 'inflection'

const argv = minimist(process.argv.slice(2))

const objectTemplate = handlebars.compile(fs.readFileSync('./templates/object_generic.hbs', 'utf8'))
const rootTemplate = handlebars.compile(fs.readFileSync('./templates/object_root.hbs', 'utf8'))
const schema = fs.readFileSync(argv.schema, 'utf8')

const snakeToCamel = (str) => {
  return str
    .replace(/_{1,}/g, '_')
    .replace(/_(.)/g, (_, letter) => R.toUpper(letter))
}

const snakeToPascal = R.pipe(snakeToCamel, (str) => {
  return str.replace(/^(.)/, (_, letter) => R.toUpper(letter))
})

const extractTables = R.curry((expr, str) => {
  let match = null
  const groups = [];
  while(match = expr.exec(str)) {
    groups.push({
      raw: match[0],
      name: singularize(match[1]),
      pascalName: singularize(snakeToPascal(match[1])),
      fields: match[2]
    })
  }

  return groups;
})

const createScalarFields = R.curry((scalarMap, tables) => {
  return tables.map(table => {
    const fields = R.filter((arr) => arr.length, R.split('\n', table.fields));

    table.fields = R.join('\n', R.map(field => {
      const fieldArr = R.filter(R.identity, R.split(' ', field))

      return {
        name: fieldArr[0],
        camelName: snakeToCamel(fieldArr[0]),
        required: field.includes('NOT NULL'),
        type: scalarMap[fieldArr[1]]
      }
    }, fields))

    return table
  })
})

const createAssociationFields = (tables) => {
  return tables
}

const tables = R.pipe(
  extractTables(/CREATE TABLE (.*) \(([\s\S][^;]*)(\))/gm),
  createScalarFields({
    'integer': 'Int',
    'boolean': 'Boolean',
    'character': 'String',
    'text': 'String',
    'timestamp': 'String',
    'tsvector': 'String',
    'date': 'String',
    'datetime': 'String',
    'double': 'Float',
    'float': 'Float'
  }),
  // createAssociationFields
)(schema)

tables.forEach(table => {
  console.log(objectTemplate(table))
})
