// =========================================================
// LibreAI — Rendu Markdown minimal et sûr (échappe le HTML)
// Supporte : titres, gras/italique, listes, blocs de code, liens, paragraphes
// =========================================================
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineFormat(text) {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return t;
}

let codeBlockId = 0;

function renderMarkdown(source) {
  const lines = (source || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  let listBuffer = null; // 'ul' | 'ol'

  function closeList() {
    if (listBuffer) {
      html += listBuffer === 'ul' ? '</ul>' : '</ol>';
      listBuffer = null;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Bloc de code ```lang ... ```
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      closeList();
      const lang = fenceMatch[1] || 'texte';
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const id = 'code-' + Date.now() + '-' + codeBlockId++;
      const codeContent = escapeHtml(codeLines.join('\n'));
      html += `<div class="code-block">
        <div class="code-block-head">
          <span>${escapeHtml(lang)}</span>
          <button type="button" onclick="copyCodeBlock('${id}', this)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copier
          </button>
        </div>
        <pre><code id="${id}">${codeContent}</code></pre>
      </div>`;
      continue;
    }

    // Titres
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html += `<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`;
      i++;
      continue;
    }

    // Listes non ordonnées
    if (/^\s*[-*]\s+/.test(line)) {
      if (listBuffer !== 'ul') { closeList(); html += '<ul>'; listBuffer = 'ul'; }
      html += `<li>${inlineFormat(line.replace(/^\s*[-*]\s+/, ''))}</li>`;
      i++;
      continue;
    }

    // Listes ordonnées
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listBuffer !== 'ol') { closeList(); html += '<ol>'; listBuffer = 'ol'; }
      html += `<li>${inlineFormat(line.replace(/^\s*\d+\.\s+/, ''))}</li>`;
      i++;
      continue;
    }

    closeList();

    if (line.trim() === '') { i++; continue; }

    // Paragraphe (regroupe les lignes suivantes jusqu'à ligne vide)
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i]) && !/^#{1,3}\s/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    html += `<p>${inlineFormat(para.join('\n')).replace(/\n/g, '<br>')}</p>`;
  }
  closeList();
  return html;
}

function copyCodeBlock(id, btnEl) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const original = btnEl.innerHTML;
    btnEl.innerHTML = '✓ Copié';
    setTimeout(() => { btnEl.innerHTML = original; }, 1600);
  }).catch(() => {});
}
