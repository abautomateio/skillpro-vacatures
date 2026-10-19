// Publieke site (statisch, GitHub Pages): formulieren gaan naar het Apps Script-eindpunt van
// Skillpro, zonder dat de kantoorcomputer aan internet hangt. Zonder JavaScript verstuurt de
// browser het formulier zelf (tekstvelden; het CV gaat dan niet mee).
(function () {
  "use strict";

  var MAX_CV_BYTES = 10 * 1024 * 1024;
  var CV_TYPES = [".pdf", ".doc", ".docx", ".txt"];

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

  function showError(form, message) {
    var box = form.querySelector("[data-form-error]");
    if (box) { box.textContent = message; box.hidden = false; }
  }

  function setBusy(form, busy) {
    var button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = busy; button.textContent = busy ? "Bezig met versturen" : button.dataset.label || button.textContent; }
  }

  function handle(form) {
    form.addEventListener("submit", function (event) {
      var endpoint = form.getAttribute("action");
      if (!endpoint || endpoint.charAt(0) === "/") return; // dynamische site: server verwerkt het
      event.preventDefault();
      var data = {};
      new FormData(form).forEach(function (value, key) {
        if (value instanceof File) return;
        if (data[key] !== undefined) { data[key] = [].concat(data[key], value); } else { data[key] = value; }
      });
      if (!data.toestemming) { showError(form, "Zonder toestemming kunnen we je gegevens niet bewaren."); return; }
      var required = form.getAttribute("data-kind") === "sollicitatie" ? ["naam", "email"] : ["voornaam", "email", "functies"];
      for (var i = 0; i < required.length; i++) {
        if (!String(data[required[i]] || "").trim()) { showError(form, "Vul de verplichte velden in."); return; }
      }
      var fileInput = form.querySelector('input[type="file"]');
      var file = fileInput && fileInput.files && fileInput.files[0];
      var ready = Promise.resolve(null);
      if (file) {
        var ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        if (CV_TYPES.indexOf(ext) === -1) { showError(form, "Alleen PDF, Word of tekst als CV."); return; }
        if (file.size > MAX_CV_BYTES) { showError(form, "Het CV is groter dan 10 MB."); return; }
        ready = readFile(file);
      }
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
        showError(form, error && error.message ? error.message : "Versturen is niet gelukt. Probeer het later opnieuw of mail naar info@skillpro.nl.");
      });
    });
  }

  function filters() {
    var form = document.getElementById("vacancy-filters");
    var list = document.getElementById("vacancy-list");
    if (!form || !list) return;
    var noMatch = document.getElementById("no-match");
    function apply() {
      var sector = form.elements.sector ? form.elements.sector.value : "";
      var province = form.elements.provincie ? form.elements.provincie.value : "";
      var shown = 0;
      Array.prototype.forEach.call(list.children, function (item) {
        var ok = (!sector || item.getAttribute("data-sector") === sector) &&
          (!province || item.getAttribute("data-province") === province);
        item.hidden = !ok;
        if (ok) shown += 1;
      });
      if (noMatch) noMatch.hidden = shown > 0;
    }
    var params = new URLSearchParams(location.search);
    if (form.elements.sector && params.get("sector")) form.elements.sector.value = params.get("sector");
    if (form.elements.provincie && params.get("provincie")) form.elements.provincie.value = params.get("provincie");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var next = new URLSearchParams();
      if (form.elements.sector.value) next.set("sector", form.elements.sector.value);
      if (form.elements.provincie.value) next.set("provincie", form.elements.provincie.value);
      history.replaceState(null, "", location.pathname + (next.toString() ? "?" + next.toString() : ""));
      apply();
    });
    form.addEventListener("change", apply);
    apply();
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("form.form[data-kind]"), function (form) {
      var button = form.querySelector('button[type="submit"]');
      if (button) button.dataset.label = button.textContent;
      handle(form);
    });
    filters();
  });
})();
