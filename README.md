### PGSchema-to-Graphql

Node CLI tool for quickly scaffolding out GraphQL types

### Features

- PG connection support
- pg_dump support
- Handlebars templates
- Generate individual types for each table
- Generate a query root with each type as a field

### Usage

```
-h --host                 pg host
-p --port                 pg port
-U --username             pg username
-w --no-password          don't require password
-W --password             require password
-d --database             pg database
-s --schema               input schema file
-o --out                  output directory
-t --type-template        type template file
-q --query-template       query template file
--only-types              only generate the type files
--only-query              only generate the query root type file
```

### Todo

- Better CLI
- Publish on NPM
- Language/library agnostic scalar mapping
