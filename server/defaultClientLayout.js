module.exports = (p) => `
<html>
  <title>${p.title}</title>
  <head>
    <meta name='viewport' content='width=device-width, initial-scale=1.0' />
    ${p.styles || ''}
    ${p.head || ''}
    <script>window.IS_REACT = true</script>
  </head>
  <body>
    <div id='app'>Loading</div>
    <script defer src='${p.jsBundle}'></script>    
  </body>
</html>
`
