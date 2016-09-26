import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import minimist from 'minimist'
import handlebars from 'handlebars'
import pg from 'pg'
import { singularize } from 'inflection'
import R from 'ramda'

const opts = minimist(process.argv.slice(2), {
  alias: {
    // pg client
    h: 'host',
    p: 'port',
    U: 'username',
    w: 'no-password',
    W: 'password',
    d: 'database',
    // local schema file
    s: 'schema',
    // shared
    o: 'out',
    t: 'type-template',
    q: 'query-template',
    onlyTypes: 'only-types',
    onlyQuery: 'only-query',
  },
  default: {
    'host': 'localhost',
    'port': '5432',
    'out': path.join(process.cwd(), 'out'),
    'type-template': './templates/type.hbs',
    'query-template': './templates/query.hbs',
    'only-types': false,
    'only-query': false,
  }
})

const SCALAR_FIELDS = {
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
}

const toPascalCase = (str) => {
  return str.replace(/^(.)/, (_, letter) => R.toUpper(letter))
}

const snakeToCamelCase = (str) => {
  return str
    .replace(/_{1,}/g, '_')
    .replace(/_(.)/g, (_, letter) => R.toUpper(letter))
}

const snakeToPascalCase = R.pipe(snakeToCamelCase, toPascalCase)

const sortFields = (a, b) => a.name.localeCompare(b.name)

const createTypeObject = (tableName) => {
  return {
    tableName,
    name: singularize(tableName),
    camelName: singularize(snakeToCamelCase(tableName)),
    pascalName: singularize(snakeToPascalCase(tableName)),
  }
}

const createFieldObject = (scalarMap, columnName, nullable, type) => {
  const fieldArr = R.filter(R.identity, R.split(' ', columnName))
  const name = columnName == 'id' ? '_id' : snakeToCamelCase(columnName)
  const scalarType = scalarMap[type] || 'String'
  const required = nullable ? '' : '!'
  const property = columnName === name ? null : columnName

  return { columnName, name, required, type, scalarType, property }
}

const createAssociationFields = (types) => {
  return R.map(type => {
    type.associations = R.pipe(
      R.filter(field => field.columnName.endsWith('_id')),
      R.map(field => {
        const name = field.name.replace(/Id$/, '')
        const type = toPascalCase(name)

        return { name, type }
      })
    )(type.fields)

    return type
  }, types)
}

const setHasIdField = (types) => {
  return R.map(type => {
    type.hasIdField = type.fields.some((field) => field.columnName == 'id')

    return type
  }, types)
}

const writeFiles = R.curry((opts, types) => {
  const typeTemplate = handlebars.compile(fs.readFileSync(opts.t, 'utf8'))
  const queryTemplate = handlebars.compile(fs.readFileSync(opts.q, 'utf8'))

  mkdirp.sync(opts.out)

  if (!opts.onlyQuery) {
    types.forEach(type => {
      fs.writeFileSync(path.join(opts.out, `${type.name}_type.rb`), typeTemplate(type))
    })
  }

  if (!opts.onlyTypes) {
    fs.writeFileSync(path.join(opts.out, 'query_type.rb'), queryTemplate(types))
  }
})

if (opts.schema) {

  const extractTypes = R.curry((expr, str) => {
    let match = null
    const types = []
    while(match = expr.exec(str)) {
      const type = createTypeObject(match[1])
      types.push(Object.assign({}, type, {
        raw: match[0],
        columns: match[2].replace(/('|")/g, '')
      }))
    }

    return types
  })

  const createScalarFields = R.curry((scalarMap, types) => {
    return R.map(type => {
      const columns = R.filter((arr) => arr.length, R.split('\n', type.columns))

      type.fields = R.pipe(
        R.map(column => {
          const columnArr = R.filter(R.identity, R.split(' ', column))

          return createFieldObject(
            scalarMap,
            columnArr[0],
            !column.includes('NOT NULL'),
            (columnArr[1] || '').replace(/[^\w]|[\d]/g, '')
          )
        }),
        R.sort(sortFields)
      )(columns)

      return type
    }, types)
  })

  const schema = fs.readFileSync(opts.schema, 'utf8')

  R.pipe(
    extractTypes(/CREATE TABLE (.*) \(([\s\S][^;]*)(\))/gm),
    createScalarFields(SCALAR_FIELDS),
    createAssociationFields,
    setHasIdField,
    R.sort(sortFields),
    writeFiles(opts)
  )(schema)

} else {

  const createScalarFields = R.curry((scalarMap, columns, types) => {
    return R.map(type => {
      type.fields = R.pipe(
        R.filter(column => column.table_name === type.tableName),
        R.map(column => {
          return createFieldObject(
            SCALAR_FIELDS,
            column.column_name,
            column.is_nullable,
            column.data_type
          )
        }),
        R.sort(sortFields)
      )(columns)

      return type
    }, types)
  })

  const client = new pg.Client(`postgres://${opts.u}@${opts.h}:${opts.p}/${opts.d}`);

  client.connect((err) => {
    if (err) throw err;

    const tablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
      ORDER BY table_name
    `

    const columnsQuery = `
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public'
      ORDER BY column_name
    `

    client.query(tablesQuery, (err, tablesResult) => {
      client.query(columnsQuery, (err, columnsResult) => {
        R.pipe(
          R.map(row => row.table_name),
          R.map(name => createTypeObject(name)),
          createScalarFields(SCALAR_FIELDS, columnsResult.rows),
          createAssociationFields,
          setHasIdField,
          R.sort(sortFields),
          writeFiles(opts)
        )(tablesResult.rows)

        client.end()
      })
    })
  })
}
