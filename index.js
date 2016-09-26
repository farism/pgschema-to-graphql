import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import minimist from 'minimist'
import handlebars from 'handlebars'
import { singularize } from 'inflection'
import R from 'ramda'

const opts = minimist(process.argv.slice(2), {
  default: {
    'schema': 'schema.txt',
    'out': path.join(process.cwd(), 'out'),
    'type-template': './templates/type.hbs',
    'query-template': './templates/query.hbs',
    'only-types': false,
    'only-query': false,
  },
  alias: {
    s: 'schema',
    o: 'out',
    t: 'type-template',
    q: 'query-template',
    onlyTypes: 'only-types',
    onlyQuery: 'only-query',
  }
})

const typeTemplate = handlebars.compile(fs.readFileSync(opts.t, 'utf8'))
const queryTemplate = handlebars.compile(fs.readFileSync(opts.q, 'utf8'))
const schema = fs.readFileSync(opts.schema, 'utf8')

const toPascalCase = (str) => {
  return str.replace(/^(.)/, (_, letter) => R.toUpper(letter))
}

const snakeToCamelCase = (str) => {
  return str
    .replace(/_{1,}/g, '_')
    .replace(/_(.)/g, (_, letter) => R.toUpper(letter))
}

const snakeToPascalCase = R.pipe(snakeToCamelCase, toPascalCase)

const extractTables = R.curry((expr, str) => {
  let match = null
  const groups = []
  while(match = expr.exec(str)) {
    groups.push({
      raw: match[0],
      name: singularize(match[1]),
      camelName: singularize(snakeToCamelCase(match[1])),
      pascalName: singularize(snakeToPascalCase(match[1])),
      hasIdField: /\bid integer NOT NULL\b/.test(match[2]),
      fields: match[2].replace(/('|")/g, '')
    })
  }

  return groups
})

const createScalarFields = R.curry((scalarMap, tables) => {
  return R.map(table => {
    const fields = R.filter((arr) => arr.length, R.split('\n', table.fields))

    table.fields = R.map(field => {
      const fieldArr = R.filter(R.identity, R.split(' ', field))
      const name = fieldArr[0]
      const camelName = name == 'id' ? '_id' : snakeToCamelCase(name)
      const type = (fieldArr[1] || '').replace(/[^\w]|[\d]/g, '')
      const scalarType = scalarMap[type] || 'String'
      const required = field.includes('NOT NULL') ? '!' : ''
      const property = name !== camelName ? name : null

      return { name, camelName, required, type, scalarType, property }
    }, fields)

    return table
  }, tables)
})

const createAssociationFields = (tables) => {
  return R.map(table => {
    table.associations = R.pipe(
      R.filter(field => field.name.endsWith('_id')),
      R.map(field => {
        const name = field.camelName.replace(/Id$/, '')
        const tableName = toPascalCase(name)

        return { name, tableName }
      })
    )(table.fields)

    return table
  }, tables)
}

const tables = R.pipe(
  extractTables(/CREATE TABLE (.*) \(([\s\S][^;]*)(\))/gm),
  createScalarFields({
    integer: 'Int',
    boolean: 'Boolean',
    character: 'String',
    text: 'String',
    timestamp: 'String',
    tsvector: 'String',
    date: 'String',
    datetime: 'String',
    double: 'Float',
    float: 'Float'
  }),
  createAssociationFields
)(schema)

mkdirp.sync(opts.out)

if (!opts.onlyQuery) {
  tables.forEach(table => {
    fs.writeFileSync(path.join(opts.out, `${table.name}_type.rb`), typeTemplate(table))
  })
}

if (!opts.onlyTypes) {
  fs.writeFileSync(path.join(opts.out, 'query_type.rb'), queryTemplate(tables))
}
