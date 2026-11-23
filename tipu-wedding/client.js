(() => {
  const $ = (selector) => document.querySelector(selector);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const form = $('#guest-form');
  const storageKey = 'tipu-wedding:last-edit-key';
  const pendingKey = 'tipu-wedding:pending-edit-key';
  let language = 'en';
  let editKey = '';
  let receipt = '';
  let error = '';
  let copyStatus = '';
  let busy = false;
  let loading = false;
  let lookupError = false;
  let lastKey = '';
  function editStorage() {
    return CONFIG.preview ? sessionStorage : localStorage;
  }
  try {
    lastKey =
      sessionStorage.getItem(pendingKey) ||
      editStorage().getItem(storageKey) ||
      '';
  } catch (_) {
    /* Optional on shared devices. */
  }

  function translate(root) {
    root.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = COPY[language][node.dataset.i18n];
    });
  }

  function render() {
    const t = COPY[language];
    document.documentElement.lang = language;
    document.title = t.title;
    translate(document);
    $('#languages').setAttribute('aria-label', t.language);
    all('[data-lang]').forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.lang === language)
      )
    );
    $('#couple').alt = t.coupleAlt;
    $('#previous').hidden =
      !lastKey || !!receipt || lookupError || loading || busy;
    $('#party').hidden = form.elements.attending.value === 'no';
    $('#count').textContent = new Intl.NumberFormat(
      language === 'en' ? 'en-IN' : language + '-IN-u-nu-deva'
    ).format(1 + $('#guests').childElementCount);
    $('#add').disabled = $('#guests').childElementCount + 1 >= CONFIG.maxPeople;
    $('#send span').textContent =
      t[busy ? 'pending' : receipt ? 'save' : 'submit'];
    $('#send').disabled = busy || loading || lookupError;
    form.inert = busy || loading;
    form.setAttribute('aria-busy', String(busy || loading));
    $('#error').hidden = !error && !loading;
    $('#error').textContent = loading
      ? t.load
      : error
        ? t[error] || t.unavailable
        : '';
    $('#lookup-actions').hidden = !lookupError;
    $('#preview').hidden = !CONFIG.preview;
    $('#preview').textContent =
      t[$('#confirmation').hidden ? 'preview' : 'previewSaved'];
    $('#thanks').textContent =
      t[form.elements.attending.value === 'no' ? 'thanksNo' : 'thanksYes'];
    $('#copy-status').textContent = copyStatus ? t[copyStatus] : '';
    $('#edit-url').setAttribute('aria-label', t.copyEdit);
  }

  function addGuest(person = { name: '', group: 'adult' }) {
    const fragment = $('#guest-row').content.cloneNode(true);
    fragment.querySelector('.person-name').value = person.name;
    fragment.querySelector('.person-group').value = person.group;
    $('#guests').append(fragment);
  }

  function payload() {
    return {
      name: $('#guest-name').value,
      phone: $('#phone').value,
      email: $('#email').value,
      note: $('#note').value,
      attending: form.elements.attending.value,
      days: all('[name="days"]:checked').map((input) => input.value),
      guests: all('.guest').map((row) => ({
        name: row.querySelector('.person-name').value,
        group: row.querySelector('.person-group').value
      }))
    };
  }

  function showForm() {
    $('#confirmation').hidden = true;
    $('#editor').hidden = false;
    $('#edit-url').hidden = true;
    copyStatus = '';
    render();
    $('#form-title').focus();
  }

  function startNew() {
    $('#send').before($('#error'));
    form.reset();
    $('#guests').replaceChildren();
    editKey = '';
    receipt = '';
    error = '';
    lookupError = false;
    if (CONFIG.preview || CONFIG.apiUrl) {
      history.replaceState(null, '', location.href.split('#')[0]);
    } else {
      google.script.history.replace({}, {}, '');
    }
    showForm();
  }

  function fail(code) {
    error = Object.hasOwn(COPY.en, code) ? code : 'unavailable';
    render();
    const problem = {
      badStatus: '[name=attending]',
      badName: '#guest-name',
      badPhone: '#phone',
      badEmail: '#email',
      badDays: '[name=days]',
      badNote: '#note',
      duplicate: '#phone'
    }[error];
    const field = problem
      ? $(problem)
      : all('.person-name').find(
          (input) => error === 'badGuest' && !input.value.trim()
        );
    if (field) {
      const target =
        field.closest('fieldset.attendance, fieldset.days') ||
        field.closest('.guest')?.parentElement ||
        field.closest('label');
      target.after($('#error'));
      field.focus();
    } else {
      $('#send').before($('#error'));
      $('#error').scrollIntoView({ block: 'nearest' });
    }
  }

  function callServer(method, argument) {
    if (CONFIG.preview) return previewCall(method, argument);
    if (CONFIG.apiUrl) {
      return fetch(CONFIG.apiUrl, {
        method: 'POST',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ method, argument })
      }).then((response) => {
        if (!response.ok) throw new Error('unavailable');
        return response.json();
      });
    }
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        [method](argument);
    });
  }

  function rememberKey() {
    lastKey = editKey;
    try {
      editStorage().setItem(storageKey, editKey);
      sessionStorage.removeItem(pendingKey);
    } catch (_) {
      /* The guest can still copy their link. */
    }
  }

  async function loadResponse(key) {
    if (loading || busy) return;
    form.before($('#error'));
    loading = true;
    error = '';
    lookupError = false;
    editKey = key;
    render();
    try {
      const result = await callServer('loadRSVP', key);
      if (!result.ok) {
        lookupError = true;
        error = 'missing';
        return;
      }
      const data = result.data;
      $('#guest-name').value = data.name;
      $('#phone').value = data.phone;
      $('#email').value = data.email;
      $('#note').value = data.note;
      form.elements.attending.value = data.attending;
      all('[name="days"]').forEach((input) => {
        input.checked = data.days.includes(input.value);
      });
      $('#guests').replaceChildren();
      data.guests.forEach(addGuest);
      receipt = result.id;
      rememberKey();
    } catch (_) {
      lookupError = true;
      error = 'loadFailed';
    } finally {
      loading = false;
      showForm();
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || loading || lookupError) return;
    let data;
    try {
      data = validate_(payload());
    } catch (exception) {
      fail(exception.message);
      return;
    }
    error = '';
    busy = true;
    render();
    try {
      if (!editKey) editKey = crypto.randomUUID();
      // Keep the same edit key on retry, including a lost acknowledgement.
      try {
        sessionStorage.setItem(pendingKey, editKey);
      } catch (_) {
        /* Optional recovery after a reload. */
      }
      const result = await callServer('submitRSVP', { ...data, editKey });
      if (!result.ok) {
        try {
          sessionStorage.removeItem(pendingKey);
        } catch (_) {
          /* No storage access. */
        }
        busy = false;
        fail(result.code);
        return;
      }
      receipt = result.id;
      rememberKey();
      $('#receipt-id').textContent = receipt;
      $('#editor').hidden = true;
      $('#confirmation').hidden = false;
      $('#saved-title').focus();
    } catch (_) {
      // If the server saved the response before the connection failed, this key can recover it.
      if (editKey) rememberKey();
      error = 'unavailable';
    } finally {
      busy = false;
      render();
    }
  });

  $('#add').addEventListener('click', () => {
    addGuest();
    render();
    $('#guests').lastElementChild.querySelector('input').focus();
  });
  $('#guests').addEventListener('click', (event) => {
    if (!event.target.closest('.remove')) return;
    event.target.closest('.guest').remove();
    render();
    $('#add').focus();
  });
  form.addEventListener('input', () => {
    if (error && !lookupError && !busy && !loading) {
      error = '';
      render();
    }
  });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'attending') render();
  });
  all('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => {
      language = button.dataset.lang;
      render();
    });
  });
  $('#previous').addEventListener('click', () => loadResponse(lastKey));
  $('#retry').addEventListener('click', () => loadResponse(editKey));
  $('#fresh').addEventListener('click', startNew);
  $('#edit').addEventListener('click', showForm);
  $('#another').addEventListener('click', startNew);
  $('#copy').addEventListener('click', async () => {
    const base =
      CONFIG.preview || CONFIG.apiUrl
        ? location.href.split('#')[0]
        : CONFIG.serviceUrl;
    const url = base + '#edit=' + encodeURIComponent(editKey);
    try {
      await navigator.clipboard.writeText(url);
      copyStatus = 'copied';
      $('#edit-url').hidden = true;
    } catch (_) {
      copyStatus = 'manualCopy';
      $('#edit-url').value = url;
      $('#edit-url').hidden = false;
      $('#edit-url').select();
    }
    render();
  });
  all('a[href^="#"]').forEach((anchor) =>
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const section = document.getElementById(anchor.hash.slice(1));
      section.setAttribute('tabindex', '-1');
      section.focus({ preventScroll: true });
      section.scrollIntoView({ block: 'start' });
    })
  );
  function setGroupLinks(url) {
    all('.group-link').forEach((link) => {
      link.hidden = !url;
      if (url) link.href = url;
    });
    all('.missing-group').forEach((message) => {
      message.hidden = Boolean(url);
    });
  }
  if (CONFIG.apiUrl) {
    all('.group-link').forEach((link) => {
      link.hidden = true;
    });
    callServer('groupLink', null)
      .then((result) => setGroupLinks(result.ok ? result.url : ''))
      .catch(() => setGroupLinks(''));
  } else {
    setGroupLinks(CONFIG.groupUrl);
  }
  function checkLink(hash) {
    const params = new URLSearchParams((hash || '').replace(/^#/, ''));
    if (params.has('edit')) loadResponse(params.get('edit'));
  }
  render();
  if (CONFIG.preview || CONFIG.apiUrl) checkLink(location.hash);
  else {
    loading = true;
    render();
    google.script.url.getLocation((location) => {
      loading = false;
      render();
      checkLink(location.hash);
    });
  }
})();
