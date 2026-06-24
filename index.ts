#!/usr/bin/env node
import { Command } from "commander";
import inquirer from "inquirer";
import * as fs from "fs";
import * as path from "path";

const PG_TYPES = [
    "varchar",
    "text",
    "integer",
    "bigint",
    "boolean",
    "float",
    "numeric",
    "timestamp",
    "timestamptz",
    "date",
    "json",
    "jsonb",
    "uuid",
    "serial",
    "bigserial",
];

interface Column {
    name: string;
    type: string;
    isPrimary: boolean;
}

function toPascalCase(str: string): string {
    return str
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^./, (c) => c.toUpperCase());
}

function generateMigrationContent(tableName: string, columns: Column[]): string {
    const timestamp = Date.now();
    const columnNames = columns.length > 0
        ? columns.map((c) => toPascalCase(c.name)).join("And")
        : "Schema";
    const className = `Add${columnNames}To${toPascalCase(tableName)}${timestamp}`;

    const columnEntries = columns
        .map((c) => {
            const primary = c.isPrimary ? `, isPrimary: true` : "";
            return `            new TableColumn({ name: "${c.name}", type: "${c.type}"${primary} }),`;
        })
        .join("\n");

    const columnsBlock = columns.length > 0
        ? `[\n${columnEntries}\n        ]`
        : `[]`;

    return `import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class ${className} implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns("${tableName}", ${columnsBlock});
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumns("${tableName}", ${columnsBlock});
    }
}
`;
}

function writeMigration(tableName: string, columns: Column[]): void {
    const timestamp = Date.now();
    const outputDir = path.join(process.cwd(), "generated_migrations");
    fs.mkdirSync(outputDir, { recursive: true });

    const filename = `${timestamp}-add-columns-to-${tableName}.ts`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, generateMigrationContent(tableName, columns));

    console.log(`\nMigration generated: ${filepath}`);
}

const program = new Command();

program
    .name("migration-builder")
    .description("Build TypeORM migrations")
    .version("0.0.0");

program
    .command("generate")
    .description("Interactively generate a TypeORM add-column migration")
    .action(async () => {
        const { tableName } = await inquirer.prompt([
            {
                type: "input",
                name: "tableName",
                message: "What is the table name?",
                validate: (input: string) =>
                    input.trim() ? true : "Table name cannot be empty.",
            },
        ]);

        const columns: Column[] = [];
        let hasPrimary = false;

        while (true) {
            const { addColumn } = await inquirer.prompt([
                {
                    type: "confirm",
                    name: "addColumn",
                    message: "Do you want to add a column?",
                    default: true,
                },
            ]);

            if (!addColumn) break;

            const { columnName } = await inquirer.prompt([
                {
                    type: "input",
                    name: "columnName",
                    message: "Column name:",
                    validate: (input: string) =>
                        input.trim() ? true : "Column name cannot be empty.",
                },
            ]);

            const { columnType } = await inquirer.prompt([
                {
                    type: "list",
                    name: "columnType",
                    message: "Select PostgreSQL data type:",
                    choices: PG_TYPES,
                },
            ]);

            let isPrimary = false;
            if (!hasPrimary) {
                const { primary } = await inquirer.prompt([
                    {
                        type: "confirm",
                        name: "primary",
                        message: "Is this the primary key?",
                        default: false,
                    },
                ]);
                isPrimary = primary;
                if (isPrimary) hasPrimary = true;
            }

            columns.push({ name: columnName.trim(), type: columnType, isPrimary });
        }

        if (columns.length === 0) {
            console.warn("\nWarning: no columns defined. Generating empty migration.");
        }

        writeMigration(tableName.trim(), columns);
    });

program.parse(process.argv);
