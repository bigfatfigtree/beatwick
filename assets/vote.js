/* Beatwick fan voting — binds every .vote-btn to the Netlify Functions backend.
   Local dedupe via localStorage. Never invents counts: if the backend is
   unreachable (e.g. local preview) it says so and shows no numbers. */
(function () {
  "use strict";

  var VOTE_URL = "/.netlify/functions/vote";
  var RESULTS_URL = "/.netlify/functions/results";
  var OFFLINE_MSG = "Voting opens on the live site";

  function votedKey(chart, id) {
    return "bw-voted-" + chart + "-" + id;
  }

  function markVoted(btn) {
    btn.classList.add("voted");
    btn.textContent = "VOTED";
    btn.disabled = true;
  }

  function countHtml(n) {
    n = Number(n) || 0;
    return "<b>" + n.toLocaleString("en-US") + "</b> vote" + (n === 1 ? "" : "s");
  }

  function setCount(chart, id, n) {
    var el = document.querySelector('.vote-count[data-votes="' + chart + "-" + id + '"]');
    if (el) el.innerHTML = countHtml(n);
  }

  function offline() {
    document.querySelectorAll(".vote-count").forEach(function (el) {
      el.innerHTML = '<span style="color:var(--dim);font-style:italic;font-size:12px">' +
        OFFLINE_MSG + "</span>";
    });
    document.querySelectorAll(".vote-btn").forEach(function (btn) {
      btn.title = OFFLINE_MSG;
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var buttons = Array.prototype.slice.call(document.querySelectorAll(".vote-btn"));
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      var chart = btn.getAttribute("data-chart");
      var id = btn.getAttribute("data-id");

      if (window.localStorage && localStorage.getItem(votedKey(chart, id))) {
        markVoted(btn);
      }

      btn.addEventListener("click", function () {
        if (window.localStorage && localStorage.getItem(votedKey(chart, id))) return;
        btn.disabled = true;
        btn.textContent = "...";
        fetch(VOTE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chart: chart, id: Number(id) }),
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; });
          })
          .then(function (data) {
            if (data && (data.ok || data.error === "already-voted")) {
              if (window.localStorage) {
                try { localStorage.setItem(votedKey(chart, id), String(Date.now())); } catch (e) {}
              }
              markVoted(btn);
              if (typeof data.count === "number") setCount(chart, id, data.count);
            } else {
              btn.disabled = false;
              btn.textContent = "VOTE";
              btn.title = OFFLINE_MSG;
            }
          })
          .catch(function () {
            btn.disabled = false;
            btn.textContent = "VOTE";
            btn.title = OFFLINE_MSG;
          });
      });
    });

    fetch(RESULTS_URL + "?chart=global")
      .then(function (res) {
        if (!res.ok) throw new Error("results-unavailable");
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error("results-unavailable");
        var votes = data.votes || {};
        document.querySelectorAll(".vote-count").forEach(function (el) {
          var parts = (el.getAttribute("data-votes") || "").split("-");
          var id = parts[parts.length - 1];
          el.innerHTML = countHtml(votes[id]);
        });
      })
      .catch(offline);
  });
})();
