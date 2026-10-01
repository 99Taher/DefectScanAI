import { useState, useRef, useCallback } from 'react'
import './index.css'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

const PIPELINE_STEPS = ['Upload', 'Blob Storage', 'Service Bus', 'ML Worker', 'YOLO', 'Results']

function App() {
  const [phase, setPhase] = useState('idle') // idle | uploading | processing | done | error
  const [jobId, setJobId] = useState(null)
  const [result, setResult] = useState(null)
  const [originalImage, setOriginalImage] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [activeStep, setActiveStep] = useState(-1)
  const fileInputRef = useRef(null)
  const pollRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const pollResult = useCallback((id) => {
    let stepIdx = 1
    const steps = [1, 2, 3, 4, 5]
    const stepInterval = setInterval(() => {
      if (stepIdx < steps.length) {
        setActiveStep(steps[stepIdx])
        stepIdx++
      } else {
        clearInterval(stepInterval)
      }
    }, 800)

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/results/${id}`)
        const data = await res.json()
        if (data.status === 'done') {
          stopPolling()
          clearInterval(stepInterval)
          setActiveStep(5)
          setResult(data)
          setPhase('done')
        }
      } catch {
        stopPolling()
        setPhase('error')
      }
    }, 2000)
  }, [])

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPhase('uploading')
    setActiveStep(0)
    setResult(null)
    setJobId(null)

    const reader = new FileReader()
    reader.onload = (e) => setOriginalImage(e.target.result)
    reader.readAsDataURL(file)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/images`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setJobId(data.job_id)
      setPhase('processing')
      setActiveStep(1)
      pollResult(data.job_id)
    } catch (err) {
      console.error(err)
      setPhase('error')
    }
  }, [pollResult])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }, [handleFile])

  const handleReset = () => {
    stopPolling()
    setPhase('idle')
    setResult(null)
    setJobId(null)
    setOriginalImage(null)
    setActiveStep(-1)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const confidence = result ? Math.round(result.confidence * 100) : 0
  const isDefect = result?.defect
  const verdictClass = isDefect ? 'defect-found' : 'no-defect'

  return (
    <div className="app-wrapper">
      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Header */}
      <header>
        <div className="logo">
          <div className="logo-icon">🔬</div>
          <div className="logo-text">Defect<span>Scan</span> AI</div>
        </div>
        <div className="header-badge">
          <div className="badge-dot" />
          Cloud-Native · YOLO · Azure
        </div>
      </header>

      <main>
        {/* Hero */}
        <div className="hero">
          <div className="hero-tag">🏭 Industrial Quality Control</div>
          <h1>
            Detect Manufacturing <br />
            <span className="gradient-text">Defects Instantly</span>
          </h1>
          <p>
            Upload an industrial image and our deep learning pipeline — powered by YOLO and Azure —
            will detect and localize defects in seconds.
          </p>
        </div>

        {/* Pipeline visualization */}
        <div className="pipeline">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step} className="pipeline-step">
              <div className={`step-dot ${activeStep === i ? 'active' : activeStep > i ? 'done' : ''}`}>
                {activeStep > i ? '✓ ' : ''}{step}
              </div>
              {i < PIPELINE_STEPS.length - 1 && <span className="step-arrow">→</span>}
            </div>
          ))}
        </div>

        {/* Upload zone — shown when idle */}
        {phase === 'idle' && (
          <div
            className={`upload-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            id="upload-drop-zone"
            role="button"
            aria-label="Upload industrial image for defect detection"
          >
            <div className="upload-icon">🖼️</div>
            <h3>Drop your industrial image here</h3>
            <p>Drag & drop or click to browse your files</p>
            <button className="upload-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
              📁 Choose File
            </button>
            <div className="upload-formats">
              {['PNG', 'JPG', 'JPEG', 'WEBP'].map(f => (
                <span key={f} className="format-tag">.{f.toLowerCase()}</span>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="file-input"
              id="file-input"
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        )}

        {/* Status bar — uploading */}
        {phase === 'uploading' && (
          <div className="status-bar processing">
            <span className="status-icon">📤</span>
            <div className="status-info">
              <div className="status-title">Uploading to Azure Blob Storage…</div>
              <div className="status-subtitle">Sending image to cloud infrastructure</div>
            </div>
            <div className="spinner" />
          </div>
        )}

        {/* Status bar — processing */}
        {phase === 'processing' && (
          <div className="status-bar processing">
            <span className="status-icon">⚙️</span>
            <div className="status-info">
              <div className="status-title">ML Worker is running YOLO inference…</div>
              <div className="status-subtitle">Job ID: {jobId}</div>
            </div>
            <div className="spinner" />
          </div>
        )}

        {/* Status bar — error */}
        {phase === 'error' && (
          <div className="status-bar error">
            <span className="status-icon">⚠️</span>
            <div className="status-info">
              <div className="status-title">Something went wrong</div>
              <div className="status-subtitle">Make sure the backend is running at {API_BASE}</div>
            </div>
          </div>
        )}

        {/* Results */}
        {phase === 'done' && result && (
          <>
            <div className="status-bar done-clean" style={isDefect ? {borderColor:'rgba(239,68,68,0.3)', background:'rgba(239,68,68,0.05)'} : {}}>
              <span className="status-icon">{isDefect ? '🔴' : '🟢'}</span>
              <div className="status-info">
                <div className="status-title">
                  Analysis complete — {isDefect ? 'Defect detected!' : 'Product is defect-free'}
                </div>
                <div className="status-subtitle">Job ID: {result.job_id}</div>
              </div>
              <span style={{ fontSize: 20 }}>{isDefect ? '❌' : '✅'}</span>
            </div>

            <div className="results-grid">
              {/* Verdict Card */}
              <div className={`verdict-card ${verdictClass}`}>
                <div className="verdict-header">
                  <div className="verdict-icon">
                    {isDefect ? '⚠️' : '✅'}
                  </div>
                  <div>
                    <div className="verdict-label">Verdict</div>
                    <div className="verdict-title">
                      {isDefect ? 'Defect Found' : 'No Defect'}
                    </div>
                  </div>
                </div>

                <div className="metrics">
                  <div className="metric">
                    <div className="metric-label">
                      <span>Confidence Score</span>
                      <span className="metric-value">{confidence}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${confidence}%` }} />
                    </div>
                  </div>
                </div>

                <div className="stats-row">
                  <div className="stat-box">
                    <div className="num">{result.detections_count}</div>
                    <div className="lbl">Detections</div>
                  </div>
                  <div className="stat-box">
                    <div className="num">{confidence}%</div>
                    <div className="lbl">Confidence</div>
                  </div>
                </div>
              </div>

              {/* Annotated image card */}
              <div className="image-card">
                <div className="image-card-header">
                  <span className="image-card-title">Annotated Result</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>YOLO Segmentation</span>
                </div>
                <div className="image-wrapper">
                  {result.annotated_image_base64 ? (
                    <img
                      src={`data:image/jpeg;base64,${result.annotated_image_base64}`}
                      alt="YOLO annotated defect detection result"
                    />
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>No annotation available</span>
                  )}
                </div>
              </div>
            </div>

            {/* Original image */}
            {originalImage && (
              <div className="image-card" style={{ marginBottom: 32 }}>
                <div className="image-card-header">
                  <span className="image-card-title">Original Image</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uploaded</span>
                </div>
                <div className="image-wrapper">
                  <img src={originalImage} alt="Original uploaded industrial image" />
                </div>
              </div>
            )}

            <button className="reset-btn" onClick={handleReset} id="analyze-another-btn">
              ↩ Analyze Another Image
            </button>
          </>
        )}

        {/* Reset when not idle */}
        {(phase === 'uploading' || phase === 'processing' || phase === 'error') && (
          <button className="reset-btn" onClick={handleReset}>✕ Cancel</button>
        )}
      </main>

      <footer>
        <p>
          Built with <span>YOLO · FastAPI · Azure Blob Storage · Azure Service Bus · Docker</span>
        </p>
      </footer>
    </div>
  )
}

export default App
