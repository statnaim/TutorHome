/* ShikkhaSetu API client. Reads use JSONP; writes use a hidden cross-origin form + iframe,
   then poll the backend for the recorded result. This avoids fetch CORS/no-cors traps. */

(() => {
  'use strict';

  const pending = new Set();

  const apiUrl = () => {
    if (!window.CONFIG?.API_URL ||
        !/^https:\/\/script\.google\.com\/macros\/s\//.test(window.CONFIG.API_URL)) {
      throw new Error('config.js ফাইলে সঠিক Apps Script Web App URL বসান।');
    }
    return window.CONFIG.API_URL;
  };

  const makeId = () => (
    crypto?.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const jsonp = (params) => new Promise((resolve, reject) => {

    const callback = `ss_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const script = document.createElement('script');

    const timer = setTimeout(
      () => finish(new Error('সার্ভার থেকে সময়মতো উত্তর পাওয়া যায়নি।')),
      CONFIG.REQUEST_TIMEOUT_MS
    );

    const finish = (err, data) => {
      clearTimeout(timer);
      delete window[callback];
      script.remove();

      err ? reject(err) : resolve(data);
    };

    window[callback] = data => finish(null, data);

    const query = new URLSearchParams({
      ...params,
      callback
    });

    script.src = `${apiUrl()}?${query.toString()}`;

    script.onerror = () => finish(
      new Error('সার্ভারের সঙ্গে সংযোগ করা যায়নি।')
    );

    document.head.appendChild(script);

  });


  // =================================
  // TUTOR SUBMISSION
  // =================================

  async function submitTutor(data) {

    if (pending.size) {
      throw new Error(
        'আগের জমাদানটি সম্পন্ন হওয়া পর্যন্ত অপেক্ষা করুন।'
      );
    }

    const requestId = makeId();

    pending.add(requestId);

    const frameName = `ss_frame_${requestId.replace(/[^a-zA-Z0-9]/g, '')}`;

    const iframe = document.createElement('iframe');

    iframe.name = frameName;
    iframe.hidden = true;

    const form = document.createElement('form');

    form.hidden = true;
    form.method = 'POST';
    form.action = apiUrl();
    form.target = frameName;

    const add = (name, value) => {
      const input = document.createElement('input');
      input.name = name;
      input.value = String(value ?? '');
      form.appendChild(input);
    };

    add('action', 'submitTutor');
    add('requestId', requestId);
    add('payload', JSON.stringify(data));

    document.body.append(iframe, form);

    try {

      form.submit();

      for (let i = 0; i < CONFIG.POLL_ATTEMPTS; i++) {

        await new Promise(
          resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL_MS)
        );

        const result = await jsonp({
          action: 'submissionStatus',
          requestId
        });

        if (
          result?.success &&
          result?.data?.status === 'complete'
        ) {

          if (!result.data.result?.success) {
            throw new Error(
              result.data.result?.message ||
              'তথ্য জমা দেওয়া যায়নি।'
            );
          }

          return result.data.result;

        }

      }

      throw new Error(
        'জমাদানের অবস্থা নিশ্চিত করা যায়নি। কিছুক্ষণ পর Tutor ID দিয়ে যাচাই করুন; একই ফর্ম আবার জমা দেবেন না।'
      );

    } finally {

      pending.delete(requestId);

      form.remove();
      iframe.remove();

    }

  }


  // =================================
  // SEARCH TUTORS
  // =================================

  async function searchTutors(filters = {}) {

    const result = await jsonp({
      action: 'searchTutors',
      filters: JSON.stringify(filters)
    });

    if (!result?.success) {
      throw new Error(
        result?.message || 'শিক্ষক খুঁজতে সমস্যা হয়েছে।'
      );
    }

    return result.data;

  }


  // =================================
  // GET TUTOR DETAILS
  // =================================

  async function getTutorDetails(tutorID) {

    const result = await jsonp({
      action: 'getTutorDetails',
      tutorID
    });

    if (!result?.success) {
      throw new Error(
        result?.message || 'শিক্ষকের তথ্য পাওয়া যায়নি।'
      );
    }

    return result.data;

  }


  // =================================
  // GET STATISTICS
  // =================================

  async function getTutorStatistics() {

    const result = await jsonp({
      action: 'getTutorStatistics'
    });

    if (!result?.success) {
      throw new Error(
        result?.message || 'পরিসংখ্যান পাওয়া যায়নি।'
      );
    }

    return result.data;

  }


  // =================================
  // PUBLIC API
  // =================================

  window.ShikkhaAPI = Object.freeze({
    submitTutor,
    searchTutors,
    getTutorDetails,
    getTutorStatistics
  });

})();