import type { ClientContext } from '../types'

export type ClientErrorContext = ClientContext & { id: string }

export class ClientError extends Error {
    public readonly clientInfo: { id: string; endpoint: string; streams: string[] }

    public constructor(context: ClientErrorContext, message?: string, options?: ErrorOptions) {
        super(message, options)

        this.clientInfo = {
            id: context.id,
            endpoint: context.client.address,
            streams: [...context.streams],
        }
    }
}
