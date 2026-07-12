export const PATIENT_ACCESS_EXCHANGE_ERROR =
  'This access link is invalid or has expired. Please request a new link.'

// This bootstrap intentionally runs as a parser-executed inline script on the
// exchange page. It removes the fragment before hydration, auth/profile
// requests, or optional widgets can run. The invitation exists only in this
// function's local variables and the single same-origin redemption request.
export const PATIENT_ACCESS_EXCHANGE_SCRIPT = String.raw`
(function () {
  'use strict';

  var errorMessage = 'This access link is invalid or has expired. Please request a new link.';
  var setError = function () {
    var element = document.getElementById('patient-access-status');
    if (element) element.textContent = errorMessage;
    var button = document.getElementById('patient-access-clear-session');
    if (button) button.hidden = false;
  };

  var clearButton = document.getElementById('patient-access-clear-session');
  if (clearButton) {
    clearButton.addEventListener('click', function () {
      clearButton.disabled = true;
      Promise.resolve(window.fetch('/api/patient-access/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        body: '{}'
      }))
        .then(function (response) {
          if (!response || !response.ok) throw new Error('clear rejected');
          var element = document.getElementById('patient-access-status');
          if (element) {
            element.textContent = 'Patient access has been cleared from this browser.';
          }
          clearButton.hidden = true;
        })
        .catch(function () {
          clearButton.disabled = false;
          setError();
        });
    });
  }

  var current;
  try {
    current = new URL(window.location.href);
  } catch (_error) {
    setError();
    return;
  }

  var queryContainedCapability = current.searchParams.has('capability');
  var rawFragment = current.hash.length > 1 ? current.hash.slice(1) : '';
  current.hash = '';
  current.searchParams.delete('capability');
  var cleanPath = current.pathname + current.search;

  // This must remain before fragment parsing and before the fetch below.
  window.history.replaceState(null, '', cleanPath);

  if (queryContainedCapability || !rawFragment) {
    rawFragment = '';
    setError();
    return;
  }

  var fragmentParameters = new URLSearchParams(rawFragment);
  rawFragment = '';
  var entries = Array.from(fragmentParameters.entries());
  if (
    entries.length !== 1 ||
    entries[0][0] !== 'capability' ||
    !entries[0][1] ||
    entries[0][1].length > 4096
  ) {
    setError();
    return;
  }

  var capability = entries[0][1];
  entries = [];
  fragmentParameters = null;
  var requestBody = JSON.stringify({ capability_token: capability });
  var request;
  try {
    request = window.fetch('/api/patient-access/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      body: requestBody
    });
  } catch (_error) {
    capability = '';
    requestBody = '';
    setError();
    return;
  }

  capability = '';
  requestBody = '';

  Promise.resolve(request)
    .then(function (response) {
      if (!response || !response.ok) throw new Error('redemption rejected');
      return response.json();
    })
    .then(function (result) {
      var allowedPaths = ['/patient/historian'];
      if (
        !result ||
        result.success !== true ||
        typeof result.redirect_path !== 'string' ||
        allowedPaths.indexOf(result.redirect_path) === -1
      ) {
        throw new Error('redirect rejected');
      }
      window.location.replace(result.redirect_path);
    })
    .catch(function () {
      setError();
    });
})();
`
