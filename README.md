### PGSchema-to-Graphql

Node CLI tool for quickly scaffolding out GraphQL types

### Features

- Handlebars templates
- Generate individual types for each table
- Generate a query root with each type as a field

### Usage

```
-s --schema               input schema file
-o --out                  output directory
-t --type-template        type template file
-t --query-template       query template file
--only-types              only generate the type files
--only-query              only generate the query root type file
```

### Todo

- Better CLI
- Publish on NPM
- Library agnostic scalar mapping
