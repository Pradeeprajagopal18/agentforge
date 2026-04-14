/**
 * Detects code artifacts in assistant message text.
 * Returns an array of { lang, code, title, lineStart } objects.
 */
export function extractArtifacts(text) {
  if (!text) return []
  const artifacts = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  let idx = 0
  while ((match = regex.exec(text)) !== null) {
    const lang = match[1] || 'text'
    const code = match[2].trimEnd()
    if (code.trim().length < 20) continue  // skip tiny snippets
    // Generate a title from the lang + order
    const title = titleFromLang(lang, idx)
    artifacts.push({ id: `artifact-${idx}`, lang, code, title, lineStart: match.index })
    idx++
  }
  return artifacts
}

function titleFromLang(lang, idx) {
  const map = {
    python: 'Python', py: 'Python',
    javascript: 'JavaScript', js: 'JavaScript',
    typescript: 'TypeScript', ts: 'TypeScript',
    jsx: 'React JSX', tsx: 'React TSX',
    bash: 'Shell', sh: 'Shell', zsh: 'Shell',
    sql: 'SQL', yaml: 'YAML', yml: 'YAML',
    json: 'JSON', toml: 'TOML',
    go: 'Go', rust: 'Rust', rs: 'Rust',
    java: 'Java', kotlin: 'Kotlin',
    dockerfile: 'Dockerfile', docker: 'Dockerfile',
    terraform: 'Terraform', hcl: 'HCL',
    markdown: 'Markdown', md: 'Markdown',
    html: 'HTML', css: 'CSS',
    cpp: 'C++', c: 'C',
  }
  const name = map[lang?.toLowerCase()] || lang?.toUpperCase() || 'Code'
  return idx === 0 ? name : `${name} #${idx + 1}`
}

export function diffLines(original, updated) {
  const origLines = original.split('\n')
  const updLines  = updated.split('\n')
  const result = []

  // Simple line-level diff (LCS-based approximation)
  const maxLen = Math.max(origLines.length, updLines.length)
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i]
    const u = updLines[i]
    if (o === undefined) {
      result.push({ type: 'add',    line: u,  num: i + 1 })
    } else if (u === undefined) {
      result.push({ type: 'remove', line: o,  num: i + 1 })
    } else if (o !== u) {
      result.push({ type: 'remove', line: o,  num: i + 1 })
      result.push({ type: 'add',    line: u,  num: i + 1 })
    } else {
      result.push({ type: 'same',   line: o,  num: i + 1 })
    }
  }
  return result
}
