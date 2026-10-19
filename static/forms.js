// Publieke site (statisch, GitHub Pages): formulieren gaan naar het Apps Script-eindpunt van
// Skillpro, zonder dat de kantoorcomputer aan internet hangt. Zonder JavaScript verstuurt de
// browser het formulier zelf (tekstvelden; het CV gaat dan niet mee).
// Fouten worden per veld gemeld bij het verzenden, niet tijdens het typen (docs/08 punt 18).
(function () {
  "use strict";

  var MAX_CV_BYTES = 10 * 1024 * 1024;
  var CV_TYPES = [".pdf", ".doc", ".docx", ".txt"];
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var MESSAGES = {
    naam: "Vul je naam in.",
    voornaam: "Vul je voornaam in.",
    email: "Vul een geldig e-mailadres in.",
    functies: "Vul in welk werk je zoekt.",
    woonplaats: "Vul je woonplaats of postcode in.",
    bericht: "Houd je bericht korter dan 2000 tekens.",
    toestemming: "Zonder toestemming kunnen we je gegevens niet bewaren."
  };

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var data = String(reader.result);
        resolve({ name: file.name, type: file.type, base64: data.slice(data.indexOf(",") + 1) });
      };
      reader.onerror = function () { reject(new Error("Het CV kon niet worden gelezen.")); };
      reader.readAsDataURL(file);
    });
  }

  function summary(form, message) {
    var box = form.querySelector("[data-form-error]");
    if (!box) return;
    box.textContent = message || "";
    box.hidden = !message;
  }

  function field(form, name) {
    return form.querySelector('[name="' + name + '"]');
  }

  function setError(form, name, message) {
    var input = field(form, name);
    if (!input) return;
    var id = "err-" + name;
    var existing = document.getElementById(id);
    if (!message) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      if (existing) existing.parentNode.removeChild(existing);
      return;
    }
    if (!existing) {
      existing = document.createElement("span");
      existing.className = "error";
      existing.id = id;
      var label = input.closest("label");
      if (label && label.classList.contains("check")) {
        label.parentNode.insertBefore(existing, label.nextSibling);
      } else if (label) {
        label.appendChild(existing);
      } else {
        input.parentNode.insertBefore(existing, input.nextSibling);
      }
    }
    existing.textContent = message;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", id);
  }

  function validate(form, data) {
    var kind = form.getAttribute("data-kind");
    var errors = {};
    if (kind === "sollicitatie") {
      if (String(data.naam || "").trim().length < 2) errors.naam = MESSAGES.naam;
    } else {
      if (!String(data.voornaam || "").trim()) errors.voornaam = MESSAGES.voornaam;
      if (!String(data.functies || "").trim()) errors.functies = MESSAGES.functies;
      if (!String(data.woonplaats || "").trim() && !String(data.postcode || "").trim()) errors.woonplaats = MESSAGES.woonplaats;
    }
    if (!EMAIL_RE.test(String(data.email || "").trim())) errors.email = MESSAGES.email;
    if (String(data.bericht || "").length > 2000) errors.bericht = MESSAGES.bericht;
    if (!data.toestemming) errors.toestemming = MESSAGES.toestemming;
    var fileInput = form.querySelector('input[type="file"]');
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (file) {
      var ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (CV_TYPES.indexOf(ext) === -1) errors.cv = "Alleen PDF, Word of tekst als cv.";
      else if (file.size > MAX_CV_BYTES) errors.cv = "Het cv is groter dan 10 MB.";
    }
    return errors;
  }

  function showErrors(form, errors) {
    var names = ["naam", "voornaam", "email", "woonplaats", "functies", "bericht", "cv", "toestemming"];
    var first = null;
    names.forEach(function (name) {
      setError(form, name, errors[name] || "");
      if (errors[name] && !first) first = field(form, name);
    });
    var count = Object.keys(errors).length;
    summary(form, count ? "Controleer de velden hieronder." : "");
    if (first) first.focus();
    return count === 0;
  }

  function collect(form) {
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (value instanceof File) return;
      if (data[key] !== undefined) { data[key] = [].concat(data[key], value); } else { data[key] = value; }
    });
    return data;
  }

  function setBusy(form, busy) {
    var button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = busy; button.textContent = busy ? "Bezig met versturen" : button.dataset.label || button.textContent; }
  }

  function handle(form) {
    var tried = false;
    form.addEventListener("submit", function (event) {
      var endpoint = form.getAttribute("action");
      if (!endpoint || endpoint.charAt(0) === "/") return; // dynamische site: server verwerkt het
      event.preventDefault();
      tried = true;
      var data = collect(form);
      if (!showErrors(form, validate(form, data))) return;
      var fileInput = form.querySelector('input[type="file"]');
      var file = fileInput && fileInput.files && fileInput.files[0];
      var ready = file ? readFile(file) : Promise.resolve(null);
      setBusy(form, true);
      ready.then(function (cv) {
        if (cv) data.cv = cv;
        data.pagina = location.href;
        return fetch(endpoint, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(data)
        });
      }).then(function () {
        location.href = "/bedankt/" + (form.getAttribute("data-kind") === "sollicitatie" ? "sollicitatie" : "inschrijving") + "/";
      }).catch(function (error) {
        setBusy(form, false);
        summary(form, error && error.message ? error.message : "Versturen is niet gelukt. Probeer het later opnieuw of mail naar info@skillpro.nl.");
      });
    });
    // Na een mislukte poging verdwijnt een fout zodra het veld is verbeterd (bij verlaten van het veld).
    form.addEventListener("change", function (event) {
      if (!tried || !event.target.name) return;
      var errors = validate(form, collect(form));
      setError(form, event.target.name, errors[event.target.name] || "");
      if (!Object.keys(errors).length) summary(form, "");
    });
  }

  function filters() {
    var form = document.getElementById("vacancy-filters");
    var list = document.getElementById("vacancy-list");
    if (!form || !list) return;
    var noMatch = document.getElementById("no-match");
    var names = ["sector", "provincie", "uren"];
    var attrs = { sector: "data-sector", provincie: "data-province", uren: "data-hours" };
    function value(name) { return form.elements[name] ? form.elements[name].value : ""; }
    function matches(item, name, wanted) {
      if (!wanted) return true;
      var have = item.getAttribute(attrs[name]) || "";
      return name === "uren" ? have.split(" ").indexOf(wanted) !== -1 : have === wanted;
    }
    function apply() {
      var shown = 0;
      Array.prototype.forEach.call(list.children, function (item) {
        var ok = names.every(function (name) { return matches(item, name, value(name)); });
        item.hidden = !ok;
        if (ok) shown += 1;
      });
      if (noMatch) noMatch.hidden = shown > 0;
    }
    var params = new URLSearchParams(location.search);
    names.forEach(function (name) {
      if (form.elements[name] && params.get(name)) form.elements[name].value = params.get(name);
    });
    // Sectorpillen boven het formulier zetten het verborgen veld en filteren meteen.
    var pills = document.querySelectorAll("#sector-pills [data-sector]");
    function markPills() {
      Array.prototype.forEach.call(pills, function (pill) {
        pill.classList.toggle("is-active", pill.getAttribute("data-sector") === value("sector"));
      });
    }
    Array.prototype.forEach.call(pills, function (pill) {
      pill.addEventListener("click", function (event) {
        if (!form.elements.sector) return;
        event.preventDefault();
        form.elements.sector.value = pill.getAttribute("data-sector") || "";
        markPills();
        form.dispatchEvent(new Event("submit", { cancelable: true }));
      });
    });
    markPills();
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var next = new URLSearchParams();
      names.forEach(function (name) { if (value(name)) next.set(name, value(name)); });
      history.replaceState(null, "", location.pathname + (next.toString() ? "?" + next.toString() : ""));
      apply();
    });
    form.addEventListener("change", apply);
    apply();
  }

  // De vaste knopbalk op telefoons verdwijnt zodra het formulier in beeld is.
  function applyBar() {
    var bar = document.getElementById("apply-bar");
    var target = document.getElementById("solliciteren");
    if (!bar || !target || !("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (entries) {
      bar.hidden = entries.some(function (entry) { return entry.isIntersecting; });
    }, { rootMargin: "0px 0px -60px 0px" }).observe(target);
  }

  // Secties komen in beeld terwijl je scrolt; zonder JavaScript staat alles gewoon op de pagina.
  function reveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add("in"); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    Array.prototype.forEach.call(items, function (el) { observer.observe(el); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    reveal();
    Array.prototype.forEach.call(document.querySelectorAll("form.form[data-kind]"), function (form) {
      var button = form.querySelector('button[type="submit"]');
      if (button) button.dataset.label = button.textContent;
      handle(form);
    });
    filters();
    applyBar();
  });
})();
