/* Beatwick ON TOUR archive script (single canonical implementation).
   On load, any .tour-item[data-date="YYYY-MM-DD"] dated before today
   (local time) is moved into a "JUST PLAYED" bucket within the same
   .tour-section. Pages provide the bucket as .tour-played-wrap[hidden] >
   .tour-played (preferred); if a page lacks one, a .just-played bucket is
   created on the fly. When no upcoming items remain, the section's
   .tour-empty note is shown. Vanilla JS, no dependencies. */
(function () {
  function startOfToday() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function parseDate(str) {
    var parts = String(str).split("-");
    if (parts.length !== 3) return null;
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function isFiled(item) {
    return !!(
      item.closest(".tour-played") ||
      item.closest(".just-played")
    );
  }

  function getPlayedBucket(section) {
    var bucket = section.querySelector(".tour-played");
    if (bucket) return bucket;
    bucket = section.querySelector(".just-played");
    if (bucket) return bucket;
    bucket = document.createElement("div");
    bucket.className = "just-played";
    var heading = document.createElement("h3");
    heading.className = "just-played-heading";
    heading.textContent = "JUST PLAYED";
    bucket.appendChild(heading);
    section.appendChild(bucket);
    return bucket;
  }

  function archiveSection(section) {
    var today = startOfToday();
    var moved = 0;

    Array.prototype.slice
      .call(section.querySelectorAll(".tour-item[data-date]"))
      .forEach(function (item) {
        if (isFiled(item)) return; // already archived
        var d = parseDate(item.getAttribute("data-date"));
        if (d && d < today) {
          getPlayedBucket(section).appendChild(item);
          moved += 1;
        }
      });

    if (moved > 0) {
      var wrap = section.querySelector(".tour-played-wrap");
      if (wrap) wrap.removeAttribute("hidden");
    }

    // If no upcoming items remain, show the section's empty note
    var upcoming = Array.prototype.filter.call(
      section.querySelectorAll(".tour-item"),
      function (item) {
        return !isFiled(item);
      }
    );
    if (upcoming.length === 0) {
      var note = section.querySelector(".tour-empty");
      if (note) {
        note.classList.add("is-visible");
        note.removeAttribute("hidden");
      }
    }
  }

  function init() {
    Array.prototype.forEach.call(
      document.querySelectorAll(".tour-section"),
      archiveSection
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
