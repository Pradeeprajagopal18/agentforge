import React, { useRef, useState } from 'react'
import { Paperclip, X, FileText, Image } from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/gif': 'image', 'image/webp': 'image',
  'text/plain': 'file', 'text/markdown': 'file', 'application/json': 'file',
  'text/javascript': 'file', 'text/typescript': 'file',
  'text/x-python': 'file', 'text/html': 'file', 'text/css': 'file',
}

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader  = new FileReader()
    const isImage = file.type.startsWith('image/')
    reader.onload = (e) => {
      resolve({
        name: file.name, type: isImage ? 'image' : 'file',
        media_type: file.type,
        content: isImage ? e.target.result.split(',')[1] : e.target.result,
        size: file.size,
      })
    }
    reader.onerror = reject
    if (isImage) reader.readAsDataURL(file)
    else reader.readAsText(file)
  })
}

export default function FileAttachment({ attachments, setAttachments }) {
  const inputRef = useRef()
  const [dragOver, setDragOver] = useState(false)

  const addFiles = async (files) => {
    const newAtts = []
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) { alert(`${file.name} is too large (max 5MB)`); continue }
      try { newAtts.push(await readFile(file)) } catch (e) { console.error('Failed to read file:', e) }
    }
    setAttachments(prev => [...prev, ...newAtts])
  }

  const onDrop = async (e) => {
    e.preventDefault(); setDragOver(false)
    await addFiles(Array.from(e.dataTransfer.files))
  }

  const remove = (i) => setAttachments(prev => prev.filter((_, idx) => idx !== i))

  if (attachments.length === 0 && !dragOver) return (
    <button style={styles.attachBtn} onClick={() => inputRef.current.click()} title="Attach file">
      <Paperclip size={15} color="var(--tx4)" />
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => addFiles(Array.from(e.target.files))} />
    </button>
  )

  return (
    <div
      style={{ ...styles.container, ...(dragOver ? styles.dragOver : {}) }}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {attachments.map((att, i) => (
        <div key={i} style={styles.chip}>
          {att.type === 'image'
            ? <Image size={11} color="#60a5fa" />
            : <FileText size={11} color="var(--ac2)" />
          }
          <span style={styles.chipName}>{att.name}</span>
          <button style={styles.removeBtn} onClick={() => remove(i)}>
            <X size={10} color="var(--tx3)" />
          </button>
        </div>
      ))}
      <button style={styles.attachBtn} onClick={() => inputRef.current.click()} title="Add more files">
        <Paperclip size={13} color="var(--tx4)" />
      </button>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
        onChange={e => addFiles(Array.from(e.target.files))} />
    </div>
  )
}

const styles = {
  container: {
    display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px',
    background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--bd)',
    alignItems: 'center'
  },
  dragOver: { border: '1px solid var(--ac)', background: 'var(--bg4)' },
  chip: {
    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px',
    background: 'var(--bg5)', borderRadius: 20, border: '1px solid var(--bd2)'
  },
  chipName:  { fontSize: 11, color: 'var(--tx2)', fontFamily: "'Berkeley Mono', monospace", maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex', alignItems: 'center' },
  attachBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' },
}
