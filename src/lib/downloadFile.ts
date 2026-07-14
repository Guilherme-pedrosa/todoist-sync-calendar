export function triggerBrowserDownload(url: string, fileName?: string | null) {
  const link = document.createElement('a');
  link.href = url;
  if (fileName) link.download = fileName;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
