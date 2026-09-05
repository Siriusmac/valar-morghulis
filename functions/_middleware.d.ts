interface PagesContext {
  request: Request
  next: () => Promise<Response>
}

export function onRequest(context: PagesContext): Promise<Response>
