import { useCallback, useEffect, useRef, useState } from 'react'

interface NoteEditorProps {
  videoId: string
  initialValue: string
  onSave: (videoId: string, text: string) => void
  placeholder?: string
  ariaLabel?: string
}

export function NoteEditor({ videoId, initialValue, onSave, placeholder, ariaLabel = 'Video note' }: NoteEditorProps) {
  const [draft, setDraft] = useState(initialValue)
  const draftRef = useRef(initialValue)
  const savedRef = useRef(initialValue)

  const commit = useCallback(() => {
    const text = draftRef.current.slice(0, 20000)
    if (text === savedRef.current) return
    savedRef.current = text
    onSave(videoId, text)
  }, [onSave, videoId])

  useEffect(() => {
    if (draft === savedRef.current) return
    const timer = window.setTimeout(commit, 650)
    return () => window.clearTimeout(timer)
  }, [commit, draft])

  useEffect(() => () => commit(), [commit])

  return <textarea
    aria-label={ariaLabel}
    maxLength={20000}
    value={draft}
    placeholder={placeholder}
    onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value) }}
    onBlur={commit}
  />
}
