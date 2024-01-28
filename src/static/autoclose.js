if (window.opener) {
  window.opener.focus()
}
window.open("", "_self", "")
window.close()
setTimeout(window.close, 5000)
