export interface Logger {
    debug: (message: string, ...args: any[]) => void
    warn: (message: string, ...args: any[]) => void
}
