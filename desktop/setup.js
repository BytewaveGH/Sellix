// The setup screen's behaviour. Talks to the app only through window.sellixSetup
// (setup-preload.js).

const $ = (id) => document.getElementById(id)
const form = $('form')
const msg = $('msg')
const submit = $('submit')

const say = (text, kind = 'error') => {
  msg.textContent = text || ''
  msg.className = `msg ${text ? kind : ''}`
}

let mode = 'first'

window.sellixSetup.info().then((info) => {
  mode = info.mode
  if (mode === 'change') {
    $('title').textContent = 'Change business'
    $('lede').textContent = `This till is set up for ${info.current}. Anyone signed in is signed out, and the app restarts.`
    $('owner').hidden = false
    $('cancel').hidden = false
    submit.textContent = 'Change business'
  }
})

$('cancel').addEventListener('click', () => window.sellixSetup.cancel())

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  say('')
  submit.disabled = true
  const previous = submit.textContent
  submit.textContent = 'Checking…'
  try {
    const result = await window.sellixSetup.save({
      code: $('code').value,
      email: $('email').value,
      password: $('password').value,
    })
    if (!result.ok) {
      say(result.message)
      return
    }
    say(`Set up for ${result.name}. Starting…`, 'ok')
  } catch {
    say('Something went wrong. Try again.')
  } finally {
    $('password').value = ''
    submit.disabled = false
    submit.textContent = previous
  }
})
