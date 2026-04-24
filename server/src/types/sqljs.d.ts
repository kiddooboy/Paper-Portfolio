declare module 'sql.js' {
  interface QueryResults {
    columns: string[];
    values: any[][];
  }

  class Database {
    constructor(data?: Uint8Array);
    run(sql: string, params?: any[]): QueryResults[];
    exec(sql: string): QueryResults[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  class Statement {
    bind(params: any[]): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(): Record<string, any>;
    getColumnNames(): string[];
    reset(): void;
    free(): void;
  }

  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<{ Database: typeof Database }>;
  export default initSqlJs;
}
