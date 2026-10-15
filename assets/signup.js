// Beatwick "In Rotation" signup — vanilla JS, no fake signups.
// AJAX-posts #in-rotation-form to the Netlify subscribe function and reports
// the real result inline. If the backend is unreachable, it says so honestly
// instead of pretending the signup worked.
(function () {
  "use strict";

  var ENDPOINT = "/.netlify/functions/subscribe";

  function init(form) {
    if (!form || form.dataset.signupWired) return;
    form.dataset.signupWired = "1";

    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('button[type="submit"]');
    var status = form.querySelector("[data-signup-status]");

    function setStatus(text, tone) {
      if (!status) return;
      status.textContent = text;
      status.dataset.tone = tone || "";
      status.hidden = !text;
    }

    function setBusy(busy) {
      if (button) button.disabled = busy;
      if (input) input.readOnly = busy;
      form.setAttribute("aria-busy", busy ? "true" : "false");
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = input ? input.value.trim() : "";
      if (!email) {
        setStatus("Give us an email and we'll do the rest.", "error");
        if (input) input.focus();
        return;
      }

      setStatus("Spinning up…", "busy");
      setBusy(true);

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email }),
      })
        .then(function (res) {
          return res.json().then(
            function (data) {
              return { res: res, data: data };
            },
            function () {
              return { res: res, data: null };
            }
          );
        })
        .then(function (pair) {
          var res = pair.res;
          var data = pair.data || {};
          if (res.ok && data.ok) {
            setStatus("You're in rotation — see you Friday.", "ok");
            if (input) input.value = "";
            form.dispatchEvent(
              new CustomEvent("inrotation:subscribed", { bubbles: true })
            );
          } else if (data.error === "invalid-email") {
            setStatus("That email doesn't scan — try another.", "error");
          } else if (data.error === "already" || data.already) {
            setStatus("You're in rotation — see you Friday.", "ok");
          } else {
            setStatus(
              "Couldn't reach the sign-up — your email wasn't saved. Try again in a bit.",
              "error"
            );
          }
        })
        .catch(function () {
          setStatus(
            "Couldn't reach the sign-up — your email wasn't saved. Try again in a bit.",
            "error"
          );
        })
        .then(function () {
          setBusy(false);
        });
    });
  }

  function boot() {
    var forms = document.querySelectorAll(".in-rotation__form");
    for (var i = 0; i < forms.length; i++) init(forms[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
