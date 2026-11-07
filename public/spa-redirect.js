(function () {
  var redirect = sessionStorage.getItem("spa-redirect");
  sessionStorage.removeItem("spa-redirect");
  if (
    redirect &&
    redirect !== location.pathname + location.search + location.hash
  ) {
    history.replaceState(null, "", redirect);
  }
})();
