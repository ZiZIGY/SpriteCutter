export function downloadCanvas(canvas: HTMLCanvasElement, name: string, format: 'png' | 'webp'): void {
  const a = document.createElement('a')
  a.href = canvas.toDataURL(`image/${format}`)
  a.download = `${name}.${format}`
  a.click()
}

export function downloadJSON(data: unknown, name: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `${name}.json`)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: 'png' | 'webp'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), `image/${format}`)
  })
}
