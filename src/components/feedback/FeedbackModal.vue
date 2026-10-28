<script setup>
// Feedback: what happened, more details, an optional marked-up screenshot, and optional
// technical details (shown before sending). Send posts it to the developer's feedback service
// (the Marketing Cloud Toolkit's Worker, D1 table fb_data_cloud_inspector) with
// app = 'data-cloud-inspector'; Open email starts a message in the user's own mail app instead.
// The administrator policy disableFeedbackUpload leaves only the email.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { X, Camera, MonitorUp, ImageUp, Trash2, Loader2, ChevronDown, ChevronRight, Mail, Copy, Download, Send } from 'lucide-vue-next'
import ScreenshotEditor from './ScreenshotEditor.vue'
import { useOrg, currentOrg } from '../../app/useOrg.js'
import { recentCalls } from '../../lib/api.js'
import { collectFeedbackMetadata, metadataLines, pagePath, feedbackText, feedbackMailto } from '../../lib/feedbackMeta.js'
import { capturePage, captureDisplay, loadImage, fileToDataUrl, toUploadableDataUrl } from '../../lib/screenshot.js'
import { FEEDBACK_EMAIL, LINKEDIN_URL, FEEDBACK_ENDPOINT } from '../../lib/contact.js'
import { loadFeedbackContact, saveFeedbackContact } from '../../lib/feedbackContact.js'
import { policy } from '../../lib/policy.js'

const props = defineProps({ screen: { type: String, default: 'unknown' } })
const emit = defineEmits(['close'])

const org = useOrg()

const kind = ref('problem')
const message = ref('')
const details = ref('')
const includeMeta = ref(true)
const showMeta = ref(false)
const done = ref('') // what the last action did
const canSend = !policy().disableFeedbackUpload
const name = ref('')
const email = ref('')
const state = ref('idle') // idle | sending | sent | error
const sendError = ref('')
const sentNote = ref('') // e.g. the screenshot could not be attached

const image = ref(null) // canvas or <img> being marked up
const editor = ref(null)
const capturing = ref(false)
const hidden = ref(false) // while capturing this page
const shotError = ref('')
const fileInput = ref(null)

onMounted(() => {
  window.addEventListener('paste', onPaste)
  if (canSend) loadFeedbackContact().then((c) => { if (!name.value) name.value = c.name; if (!email.value) email.value = c.email })
})
onUnmounted(() => window.removeEventListener('paste', onPaste))

const meta = computed(() => collectFeedbackMetadata({
  route: pagePath(props.screen), orgHost: currentOrg()?.host, apiVersion: org.version, apiCalls: recentCalls(),
}))
const metaLines = computed(() => metadataLines(meta.value))

async function captureThisPage() {
  shotError.value = ''
  capturing.value = true
  hidden.value = true
  try {
    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    image.value = await capturePage(document.getElementById('app'))
  } catch (e) {
    shotError.value = `Could not capture this page: ${e.message}`
  } finally {
    hidden.value = false
    capturing.value = false
  }
}

async function captureOther() {
  shotError.value = ''
  capturing.value = true
  try {
    image.value = await captureDisplay()
  } catch (e) {
    if (e?.name !== 'NotAllowedError') shotError.value = `Could not capture: ${e.message}`
  } finally {
    capturing.value = false
  }
}

async function useFile(file) {
  if (!file || !file.type.startsWith('image/')) { shotError.value = 'That is not an image.'; return }
  shotError.value = ''
  try { image.value = await loadImage(await fileToDataUrl(file)) } catch (e) { shotError.value = e.message }
}
function onFile(e) { useFile(e.target.files?.[0]); e.target.value = '' }
function onPaste(e) {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
  if (item) { e.preventDefault(); useFile(item.getAsFile()) }
}

const version = () => chrome?.runtime?.getManifest?.()?.version ?? 'unknown'
const text = () => feedbackText({ kind: kind.value, message: message.value, details: details.value, meta: includeMeta.value ? meta.value : null })
const subject = () => `Data Cloud Inspector ${version()} feedback: ${KINDS.find((k) => k.id === kind.value)?.label || kind.value}`

async function submit() {
  if (!message.value.trim() || !canSend) return
  state.value = 'sending'
  sendError.value = ''
  sentNote.value = ''
  try {
    // A picture the browser cannot export is left out rather than failing the whole send.
    let screenshot = null
    if (image.value && editor.value) {
      try { screenshot = toUploadableDataUrl(editor.value.getResult()) } catch (e) { sentNote.value = `The screenshot could not be attached (${e.message}).` }
    }
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        message: message.value.trim(),
        details: details.value.trim() || null,
        kind: kind.value,
        screen: `data-cloud-inspector/${pagePath(props.screen).replace(/^\/+/, '')}`,
        app: 'data-cloud-inspector',
        version: version(),
        name: name.value.trim() || null,
        email: email.value.trim() || null,
        metadata: includeMeta.value ? meta.value : null,
        screenshot,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    saveFeedbackContact({ name: name.value, email: email.value })
    state.value = 'sent'
  } catch (e) {
    sendError.value = e.message
    state.value = 'error'
  }
}

async function copyText() {
  try { await navigator.clipboard.writeText(text()); return true } catch { return false }
}
async function openEmail() {
  if (!message.value.trim()) return
  const copied = await copyText()
  const a = document.createElement('a')
  a.href = feedbackMailto(FEEDBACK_EMAIL, subject(), text())
  a.click()
  done.value = `Opened an email to ${FEEDBACK_EMAIL} in your mail app${copied ? '; the full text is also on the clipboard' : ''}.${image.value ? ' Attach the screenshot with Download screenshot.' : ''}`
}
async function copyOnly() {
  if (!message.value.trim()) return
  done.value = (await copyText()) ? `Copied. Paste it into an email to ${FEEDBACK_EMAIL}.` : 'Could not copy; select the text and copy it.'
}
function downloadShot() {
  if (!image.value || !editor.value) return
  try {
    const a = document.createElement('a')
    a.href = toUploadableDataUrl(editor.value.getResult())
    a.download = 'data-cloud-inspector-feedback.png'
    a.click()
  } catch (e) { shotError.value = `Could not save the screenshot: ${e.message}` }
}

const KINDS = [
  { id: 'problem', label: 'Something is wrong' },
  { id: 'idea', label: 'Idea' },
  { id: 'question', label: 'Question' },
]
</script>

<template>
  <div v-show="!hidden" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @mousedown.self="state === 'sending' || emit('close')">
    <div class="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <div class="flex items-center gap-2 px-5 py-3 border-b border-border">
        <h2 id="feedback-title" class="flex-1 text-base font-semibold">Send feedback</h2>
        <button class="p-1 rounded hover:bg-accent" title="Close" @click="emit('close')"><X class="h-4 w-4" /></button>
      </div>

      <div v-if="state === 'sent'" class="p-8 text-center">
        <p class="text-base font-semibold">Thank you, it's sent.</p>
        <p v-if="sentNote" class="text-sm text-amber-700 dark:text-amber-400 mt-1">{{ sentNote }} Use Upload an image to send one.</p>
        <p class="text-sm text-muted-foreground mt-1">{{ email ? 'You may get a reply at ' + email + '.' : 'Add your email next time if you would like a reply.' }}</p>
        <button class="dci-btn-primary mt-4" @click="emit('close')">Close</button>
      </div>

      <form v-else class="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 text-sm" @submit.prevent="canSend ? submit() : openEmail()">
        <p v-if="canSend" class="text-xs text-muted-foreground">Send goes to the developer's feedback service. You can also email <a :href="`mailto:${FEEDBACK_EMAIL}`" class="text-link hover:underline">{{ FEEDBACK_EMAIL }}</a> or reach out on <a :href="LINKEDIN_URL" target="_blank" rel="noopener" class="text-link hover:underline">LinkedIn</a>.</p>
        <p v-else class="text-xs text-muted-foreground">Open email starts a message to <a :href="`mailto:${FEEDBACK_EMAIL}`" class="text-link hover:underline">{{ FEEDBACK_EMAIL }}</a> in your own mail app, so you see everything before it goes. Or reach out on <a :href="LINKEDIN_URL" target="_blank" rel="noopener" class="text-link hover:underline">LinkedIn</a>.</p>
        <div class="flex gap-2" role="radiogroup" aria-label="Kind of feedback">
          <button v-for="k in KINDS" :key="k.id" type="button" role="radio" :aria-checked="kind === k.id"
            class="h-8 px-3 rounded-md border text-xs" :class="kind === k.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'"
            @click="kind = k.id">{{ k.label }}</button>
        </div>

        <label class="block">
          <span class="font-medium">{{ kind === 'problem' ? 'What happened?' : kind === 'idea' ? 'Your idea' : 'Your question' }}</span>
          <textarea v-model="message" required rows="3" maxlength="2000" class="mt-1 w-full rounded-md border border-border bg-background p-2"
            :placeholder="kind === 'problem' ? 'For example: the profile shows no engagement although the person has web events' : ''" />
        </label>
        <label class="block">
          <span class="font-medium">More details</span> <span class="text-xs text-muted-foreground">(optional)</span>
          <textarea v-model="details" rows="4" maxlength="5000" class="mt-1 w-full rounded-md border border-border bg-background p-2"
            :placeholder="kind === 'problem' ? 'Steps to get there, what you expected, the exact error text…' : ''" />
        </label>

        <section>
          <div class="font-medium">Screenshot <span class="text-xs font-normal text-muted-foreground">(optional)</span></div>
          <div v-if="!image" class="mt-1.5 flex flex-wrap gap-2">
            <button type="button" class="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs hover:bg-accent disabled:opacity-50" :disabled="capturing" @click="captureThisPage">
              <Loader2 v-if="capturing" class="h-3.5 w-3.5 animate-spin" /><Camera v-else class="h-3.5 w-3.5" /> Capture this page
            </button>
            <button type="button" class="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs hover:bg-accent disabled:opacity-50" :disabled="capturing" @click="captureOther">
              <MonitorUp class="h-3.5 w-3.5" /> Capture another tab or window…
            </button>
            <button type="button" class="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs hover:bg-accent" @click="fileInput?.click()">
              <ImageUp class="h-3.5 w-3.5" /> Upload an image
            </button>
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />
            <span class="self-center text-xs text-muted-foreground">or paste one (Ctrl+V)</span>
          </div>
          <p v-if="shotError" class="mt-1 text-xs text-red-600">{{ shotError }}</p>
          <div v-if="image" class="mt-1.5">
            <ScreenshotEditor ref="editor" :image="image" />
            <div class="flex items-center gap-2 mt-1.5">
              <p class="flex-1 text-xs text-amber-700 dark:text-amber-400">Screenshots can show customer data. Draw over anything private before you send it.</p>
              <button type="button" class="flex items-center gap-1 h-7 px-2 rounded-md border border-border text-xs hover:bg-accent" @click="downloadShot"><Download class="h-3.5 w-3.5" /> Download screenshot</button>
              <button type="button" class="flex items-center gap-1 h-7 px-2 rounded-md border border-border text-xs hover:bg-accent" @click="image = null"><Trash2 class="h-3.5 w-3.5" /> Remove</button>
            </div>
          </div>
        </section>

        <section>
          <label class="flex items-start gap-2">
            <input v-model="includeMeta" type="checkbox" class="mt-1" />
            <span><span class="font-medium">Include technical details</span><br />
              <span class="text-xs text-muted-foreground">Version, browser, the page you are on, the org's domain and API version, and the last API calls (paths and statuses only: no SQL or data).</span></span>
          </label>
          <button v-if="includeMeta" type="button" class="mt-1 ml-6 flex items-center gap-1 text-xs text-link hover:underline" :aria-expanded="showMeta" @click="showMeta = !showMeta">
            <ChevronDown v-if="showMeta" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" /> See exactly what is sent
          </button>
          <dl v-if="includeMeta && showMeta" class="mt-1 ml-6 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-0.5 text-xs rounded-md border border-border bg-muted/30 p-2">
            <template v-for="([k, v], i) in metaLines" :key="i"><dt class="text-muted-foreground">{{ k }}</dt><dd class="break-all">{{ v }}</dd></template>
          </dl>
        </section>

        <div v-if="canSend" class="grid grid-cols-2 gap-3">
          <label class="block"><span class="text-xs text-muted-foreground">Name (optional)</span>
            <input v-model="name" maxlength="100" class="mt-0.5 w-full h-8 rounded-md border border-border bg-background px-2" /></label>
          <label class="block"><span class="text-xs text-muted-foreground">Email, if you'd like a reply (optional)</span>
            <input v-model="email" type="email" maxlength="200" class="mt-0.5 w-full h-8 rounded-md border border-border bg-background px-2" /></label>
        </div>
        <p v-if="done" class="text-sm" role="status">{{ done }}</p>
        <p v-if="state === 'error'" class="text-sm text-red-600" role="alert">Could not send ({{ sendError }}). Try again, or use Open email.</p>
        <div class="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" class="dci-btn" @click="emit('close')">Close</button>
          <button type="button" class="dci-btn" :disabled="!message.trim()" @click="copyOnly"><Copy class="h-4 w-4" /> Copy text</button>
          <button :type="canSend ? 'button' : 'submit'" :class="canSend ? 'dci-btn' : 'dci-btn-primary'" :disabled="!message.trim()" @click="canSend && openEmail()"><Mail class="h-4 w-4" /> Open email</button>
          <button v-if="canSend" type="submit" class="dci-btn-primary" :disabled="!message.trim() || state === 'sending'">
            <Loader2 v-if="state === 'sending'" class="h-4 w-4 animate-spin" /><Send v-else class="h-4 w-4" /> Send
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
