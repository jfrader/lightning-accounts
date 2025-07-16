;(function () {
  try {
    if (window.opener) {
      console.log("Autoclose: Sending postMessage to opener")
      window.opener.postMessage({ type: "twitter-auth-success" }, "*")
      window.opener.focus?.()
    } else {
      console.warn("Autoclose: No opener detected")
    }

    // Try hard-close techniques
    console.log("Autoclose: Attempting window.close()")
    window.open("", "_self", "") // override current tab to blank
    window.close()

    // Final fallback after a short delay
    setTimeout(() => {
      console.log("Autoclose: Final close attempt")
      window.close()
    }, 2000)
  } catch (e) {
    console.error("Autoclose exception:", e)
  }
})()
