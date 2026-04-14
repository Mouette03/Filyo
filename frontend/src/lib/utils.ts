/** Formats a byte count into a human-readable string (e.g. 1.4 MB). */
export function formatBytes(bytes: number | string | bigint): string {
  const n = Number(bytes)
  if (n === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(k))
  return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/** Formats a date value into a localized short date+time string. Returns '—' for null/undefined. */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(navigator.language, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(date))
}

/** Returns an emoji icon for a given MIME type or file extension. */
export function getFileIcon(mimeTypeOrExt: string): string {
  const v = (mimeTypeOrExt || '').toLowerCase()
  const isMime = v.includes('/')

  if (isMime) {
    if (v.startsWith('image/')) return '🖼️'
    if (v.startsWith('video/')) return '🎬'
    if (v.startsWith('audio/')) return '🎵'
    if (v.includes('pdf')) return '📄'
    if (v.startsWith('text/')) return '📝'
    if (v.includes('zip') || v.includes('tar') || v.includes('gz') || v.includes('rar') || v.includes('7z')) return '🗜️'
    if (v.includes('spreadsheet') || v.includes('excel') || v.includes('csv')) return '📊'
    if (v.includes('presentation') || v.includes('powerpoint')) return '📊'
    if (v.includes('word') || v.includes('document') || v.includes('opendocument')) return '📝'
    if (v.includes('javascript') || v.includes('typescript') || v.includes('python') || v.includes('json') || v.includes('xml')) return '💻'
    return '📁'
  }

  // Extension
  if (['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','heic','tiff'].includes(v)) return '🖼️'
  if (['mp4','mkv','avi','mov','wmv','flv','webm','m4v'].includes(v)) return '🎬'
  if (['mp3','wav','flac','ogg','m4a','aac','wma'].includes(v)) return '🎵'
  if (v === 'pdf') return '📄'
  if (['zip','tar','gz','7z','rar','bz2','xz','zst'].includes(v)) return '🗜️'
  if (['txt','log','ini','cfg'].includes(v)) return '📝'
  if (['md','markdown'].includes(v)) return '📖'
  if (['html','htm'].includes(v)) return '🌐'
  if (['json','yaml','yml','xml','csv'].includes(v)) return '💾'
  if (['xls','xlsx','ods','numbers'].includes(v)) return '📊'
  if (['ppt','pptx','odp','key'].includes(v)) return '📊'
  if (['doc','docx','odt','rtf','pages'].includes(v)) return '📝'
  if (['exe','msi','dmg','deb','rpm','apk','pkg'].includes(v)) return '⚙️'
  if (['js','ts','jsx','tsx','py','java','cpp','c','cs','go','rs','php','rb','swift','kt'].includes(v)) return '💻'
  if (['iso','img','bin'].includes(v)) return '💿'
  return '📁'
}

/** Triggers a browser download for a Blob with the given filename. */
/** Returns true if the string matches a basic email format. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Copie du texte dans le presse-papier avec fallback execCommand pour HTTP */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
  } else {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try {
      document.execCommand('copy')
    } finally {
      document.body.removeChild(ta)
    }
  }
}

/** Formats a bytes-per-second speed into a human-readable string (e.g. "1.4 MB/s"). */
export function formatSpeed(bps: number): string {
  if (bps <= 0) return ''
  if (bps < 1024) return `${Math.round(bps)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}
