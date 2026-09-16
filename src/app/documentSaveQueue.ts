type SaveTask<T> = () => Promise<T>

let saveQueue = Promise.resolve()

export function enqueueDocumentSave<T>(task: SaveTask<T>): Promise<T> {
  const previousSave = saveQueue
  let releaseSave: () => void = () => {}
  saveQueue = new Promise<void>((resolve) => {
    releaseSave = resolve
  })

  return (async () => {
    await previousSave
    try {
      return await task()
    } finally {
      releaseSave()
    }
  })()
}
