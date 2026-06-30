import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Trash2, X, Eye, RefreshCw, Upload, CheckCircle2, FileText, AlertCircle } from 'lucide-react';
import { apiFetch } from '../utils/api';
import WebcamCapture from '../components/WebcamCapture';

interface Room {
  id: number;
  room_number: string;
  floor: number;
  room_type: 'Single' | 'Double';
  ac_type: 'AC' | 'Non AC';
  price: string;
  status: string;
}

interface CheckInProps {
  selectedRoom: Room | null;
  onCheckInComplete: (invoiceNumber: string) => void;
  onCancel: () => void;
}

interface AdditionalGuest {
  name: string;
  id_type: string;
  id_number: string;
  // webcam base64 (fallback if no file uploaded)
  webcam_front_id?: string;
  webcam_back_id?: string;
  webcam_guest_photo?: string;
  // uploaded file objects (sent as FormData fields guest_front_N etc.)
  frontFile?: File;
  backFile?: File;
  photoFile?: File;
  // preview URLs
  frontPreview?: string;
  backPreview?: string;
  photoPreview?: string;
  // per-guest capture mode
  captureMode?: 'upload' | 'webcam';
}

interface DocFile {
  file: File;
  preview: string; // data URL
  name: string;
}

// ─── ID Validation ─────────────────────────────────────────────────────────
const AADHAAR_RE = /^\d{12}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PASSPORT_RE = /^[A-Z][1-9][0-9]{6}$/;
const DL_RE = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4,7}$/;

function validateIdNumber(idType: string, value: string): string {
  if (!value) return '';
  switch (idType) {
    case 'Aadhaar':
      return AADHAAR_RE.test(value) ? '' : 'Aadhaar Number must contain exactly 12 digits.';
    case 'PAN':
      return PAN_RE.test(value.toUpperCase()) ? '' : 'Invalid PAN Number format. Expected: ABCDE1234F';
    case 'Passport':
      return PASSPORT_RE.test(value.toUpperCase()) ? '' : 'Invalid Passport format. Expected: A1234567';
    case 'Driving License':
      return DL_RE.test(value.toUpperCase()) ? '' : 'Invalid Driving License format. Expected: MH02AB1234567';
    default:
      return '';
  }
}

// ─── Document Preview Card ──────────────────────────────────────────────────
function DocPreviewCard({
  label,
  doc,
  onRemove,
  onReplace,
}: {
  label: string;
  doc: DocFile;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const isPdf = doc.file.type === 'application/pdf';

  return (
    <>
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
        {/* Preview area */}
        <div className="relative h-28 bg-gray-50 flex items-center justify-center">
          {isPdf ? (
            <div className="flex flex-col items-center gap-1 text-gray-400">
              <FileText className="w-8 h-8 text-red-400" />
              <span className="text-[10px] font-bold uppercase">PDF</span>
            </div>
          ) : (
            <img src={doc.preview} alt={label} className="h-full w-full object-cover" />
          )}
          {/* Fullscreen btn */}
          {!isPdf && (
            <button
              type="button"
              onClick={() => setShowFull(true)}
              className="absolute top-1.5 right-1.5 p-1 bg-black/40 rounded text-white hover:bg-black/60 transition"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Footer */}
        <div className="px-2.5 py-2 border-t border-gray-100">
          <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{label}</p>
          <p className="text-[10px] font-semibold text-gray-600 truncate">{doc.name}</p>
          <div className="flex gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={onReplace}
              className="flex items-center gap-1 text-[9px] font-bold text-lodge-brown hover:text-lodge-textDark transition"
            >
              <RefreshCw className="w-3 h-3" /> Replace
            </button>
            <span className="text-gray-200">|</span>
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1 text-[9px] font-bold text-red-500 hover:text-red-700 transition"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
        </div>
      </div>

      {/* Full-image overlay */}
      {showFull && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowFull(false)}
        >
          <img src={doc.preview} alt={label} className="max-h-full max-w-full rounded-xl shadow-2xl" />
          <button
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white hover:bg-white/40"
            onClick={() => setShowFull(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
}

// ─── File Upload Zone ───────────────────────────────────────────────────────
function FileUploadZone({
  label,
  onFile,
  inputRef,
}: {
  label: string;
  onFile: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div>
      <input
        type="file"
        ref={inputRef}
        accept=".jpg,.jpeg,.png,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 10 * 1024 * 1024) {
            alert('File size must be under 10 MB.');
            return;
          }
          onFile(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-gray-200 rounded-xl h-28 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-lodge-accent hover:text-lodge-brown transition cursor-pointer bg-gray-50 hover:bg-lodge-light"
      >
        <Upload className="w-5 h-5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        <span className="text-[9px] font-semibold text-gray-300">JPG · PNG · PDF · Max 10 MB</span>
      </button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function CheckIn({ selectedRoom, onCheckInComplete, onCancel }: CheckInProps) {
  if (!selectedRoom) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow text-center text-gray-500 font-medium">
        No room selected. Please go to the Rooms page first.
      </div>
    );
  }

  // ── Guest Details ──────────────────────────────────────────────────────────
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [occupation, setOccupation] = useState('');
  const [nationality, setNationality] = useState('Indian');
  const [address, setAddress] = useState('');
  const [idType, setIdType] = useState('Aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [idError, setIdError] = useState('');

  // ── Document capture/upload state ─────────────────────────────────────────
  // webcam base64 strings (legacy path kept for compatibility)
  const [webcamFront, setWebcamFront] = useState('');
  const [webcamBack, setWebcamBack] = useState('');
  const [webcamPhoto, setWebcamPhoto] = useState('');

  // Uploaded files
  const [frontDoc, setFrontDoc] = useState<DocFile | null>(null);
  const [backDoc, setBackDoc] = useState<DocFile | null>(null);

  // Tab for ID capture method: 'webcam' | 'upload'
  const [captureMode, setCaptureMode] = useState<'webcam' | 'upload'>('upload');

  // Refs for file inputs
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  // ── Booking fields ─────────────────────────────────────────────────────────
  const [stayDuration, setStayDuration] = useState('24 Hours');
  // numPersons is auto-calculated from G+L+C — do NOT let user edit it directly
  // Keeping it as a regular variable derived from the G/L/C states
  const [purpose, setPurpose] = useState('Work');
  const [arrivingFrom, setArrivingFrom] = useState('');
  const [modeOfTravel, setModeOfTravel] = useState('Bus');
  const [customHours, setCustomHours] = useState('');
  const [customPurpose, setCustomPurpose] = useState('');
  const [customTravel, setCustomTravel] = useState('');
  const [remarks, setRemarks] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyGst, setCompanyGst] = useState('');

  // G/L/C/T person breakdown — numPersons auto-derived
  const [numGents, setNumGents] = useState('0');
  const [numLadies, setNumLadies] = useState('0');
  const [numChildren, setNumChildren] = useState('0');
  // Auto-calculate total persons (read-only derived value)
  const numPersons = String(
    (parseInt(numGents || '0') || 0) +
    (parseInt(numLadies || '0') || 0) +
    (parseInt(numChildren || '0') || 0) || 1
  );

  const [additionalGuests, setAdditionalGuests] = useState<AdditionalGuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  useEffect(() => {
    const formatted = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).replace(/,/g, '');
    setCurrentTimeStr(formatted);
  }, []);

  // ── Auto-fill returning guest ──────────────────────────────────────────────
  useEffect(() => {
    if (mobile.length === 10) {
      apiFetch(`/customers/${mobile}`)
        .then((cust) => {
          setName(cust.name);
          setAge(cust.age.toString());
          setGender(cust.gender);
          setOccupation(cust.occupation);
          setNationality(cust.nationality);
          setAddress(cust.address || '');
          setIdNumber(cust.aadhaar);
          setAutoFilled(true);
        })
        .catch(() => setAutoFilled(false));
    } else {
      setAutoFilled(false);
    }
  }, [mobile]);

  // ── ID validation on change ─────────────────────────────────────────────
  const handleIdChange = (val: string) => {
    let cleaned = val;
    if (idType === 'Aadhaar') cleaned = val.replace(/\D/g, '');
    if (idType === 'PAN') cleaned = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setIdNumber(cleaned);
    setIdError(validateIdNumber(idType, cleaned));
  };

  const handleIdTypeChange = (type: string) => {
    setIdType(type);
    setIdNumber('');
    setIdError('');
    setFrontDoc(null);
    setBackDoc(null);
    setWebcamFront('');
    setWebcamBack('');
  };

  // ── File helpers ────────────────────────────────────────────────────────
  const makeDocFile = (f: File): Promise<DocFile> =>
    new Promise((resolve) => {
      if (f.type === 'application/pdf') {
        resolve({ file: f, preview: '', name: f.name });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ file: f, preview: e.target!.result as string, name: f.name });
        reader.readAsDataURL(f);
      }
    });

  const handleFrontFile = async (f: File) => setFrontDoc(await makeDocFile(f));
  const handleBackFile = async (f: File) => setBackDoc(await makeDocFile(f));

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mobile.length !== 10) return alert('Mobile number must be exactly 10 digits.');

    // Validate ID number
    const err = validateIdNumber(idType, idNumber);
    if (err) { setIdError(err); return alert(err); }

    setLoading(true);
    try {
      // Use FormData so we can attach actual files
      const fd = new FormData();
      fd.append('room_id', String(selectedRoom.id));
      fd.append('mobile', mobile);
      fd.append('name', name);
      fd.append('age', age);
      fd.append('gender', gender);
      fd.append('occupation', occupation);
      fd.append('nationality', nationality);
      fd.append('address', address);
      fd.append('aadhaar', idNumber);   // backend field name kept as-is
      fd.append('id_type', idType);
      fd.append('stay_duration', stayDuration === 'Custom Hours' ? `${customHours} Hours` : stayDuration);
      fd.append('num_persons', numPersons);
      fd.append('purpose', purpose === 'Other' ? customPurpose : purpose);
      fd.append('arriving_from', arrivingFrom);
      fd.append('mode_of_travel', modeOfTravel === 'Other' ? customTravel : modeOfTravel);
      fd.append('remarks', remarks);
      fd.append('company_name', companyName);
      fd.append('company_gst', companyGst);
      fd.append('num_gents', numGents || '0');
      fd.append('num_ladies', numLadies || '0');
      fd.append('num_children', numChildren || '0');

      // ID documents
      if (captureMode === 'upload') {
        if (frontDoc?.file) fd.append('front_id', frontDoc.file);
        if (backDoc?.file) fd.append('back_id', backDoc.file);
      } else {
        if (webcamFront) fd.append('webcam_front_id', webcamFront);
        if (webcamBack) fd.append('webcam_back_id', webcamBack);
      }
      if (webcamPhoto) fd.append('webcam_guest_photo', webcamPhoto);

      if (additionalGuests.length > 0) {
        // Strip non-serialisable File objects before JSON.stringify
        const guestsForJson = additionalGuests.map(({ frontFile, backFile, photoFile, frontPreview, backPreview, photoPreview, ...rest }) => rest);
        fd.append('additional_guests', JSON.stringify(guestsForJson));
        // Append actual file uploads keyed by index: guest_front_0, guest_back_0 ...
        additionalGuests.forEach((g, i) => {
          if (g.frontFile) fd.append(`guest_front_${i}`, g.frontFile);
          if (g.backFile)  fd.append(`guest_back_${i}`, g.backFile);
          if (g.photoFile) fd.append(`guest_photo_${i}`, g.photoFile);
        });
      }

      // apiFetch detects FormData and automatically:
      //   - Omits Content-Type so the browser sets it with the multipart boundary
      //   - Injects Authorization: Bearer <token> from localStorage
      //   - Handles 401 session-expired by clearing token and redirecting to login
      const response = await apiFetch('/bookings/check-in', {
        method: 'POST',
        body: fd,
      });
      onCheckInComplete(response.invoiceNumber);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Additional Guests helpers ───────────────────────────────────────────
  const addAdditionalGuest = () =>
    setAdditionalGuests([...additionalGuests, { name: '', id_type: 'Aadhaar', id_number: '', captureMode: 'upload' }]);

  const updateAdditionalGuest = (index: number, fields: Partial<AdditionalGuest>) => {
    const updated = [...additionalGuests];
    updated[index] = { ...updated[index], ...fields };
    setAdditionalGuests(updated);
  };

  const removeAdditionalGuest = (index: number) =>
    setAdditionalGuests(additionalGuests.filter((_, idx) => idx !== index));

  // ── ID Number placeholder & max length ─────────────────────────────────
  const idPlaceholder: Record<string, string> = {
    Aadhaar: '12 digit number',
    PAN: 'ABCDE1234F',
    Passport: 'A1234567',
    'Driving License': 'MH02AB1234567',
  };
  const idMaxLen: Record<string, number> = {
    Aadhaar: 12, PAN: 10, Passport: 8, 'Driving License': 16,
  };

  // ── Whether to show back-side upload ────────────────────────────────────
  const needsBackSide = idType === 'Aadhaar' || idType === 'Driving License';

  const formValid = !idError && idNumber.length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col space-y-6 max-w-4xl pb-12">
      <div>
        <h2 className="text-2xl font-bold text-lodge-textDark">Check-In — Room {selectedRoom.room_number}</h2>
        <p className="text-gray-500 text-sm font-medium">
          {selectedRoom.room_type} · {selectedRoom.ac_type} · ₹{parseFloat(selectedRoom.price).toFixed(2)} / day
        </p>
      </div>

      {/* ── Guest Details ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider border-b border-gray-50 pb-2.5">Guest Details</h3>

        {autoFilled && (
          <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-lg text-xs text-amber-800 font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-500" />
            Returning guest found! Auto-filled profile.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Mobile */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Mobile *</label>
            <input type="text" required pattern="\d{10}" maxLength={10} value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              placeholder="10 digit number"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Name *</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest full name"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
          {/* Age */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Age *</label>
            <input type="number" required min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
          {/* Gender */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Gender *</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white outline-none">
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          {/* Occupation */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Occupation *</label>
            <input type="text" required value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Occupation"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
          {/* Nationality */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Nationality *</label>
            <input type="text" required value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="Indian"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Address</label>
          <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address (Optional)"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
        </div>

        {/* ── ID Type + Number ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">ID Type *</label>
            <select value={idType} onChange={(e) => handleIdTypeChange(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white outline-none">
              <option value="Aadhaar">Aadhaar</option>
              <option value="PAN">PAN Card</option>
              <option value="Passport">Passport</option>
              <option value="Driving License">Driving License</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              {idType} Number *
            </label>
            <input
              type="text"
              required
              maxLength={idMaxLen[idType] || 20}
              value={idNumber}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder={idPlaceholder[idType] || 'ID Number'}
              className={`w-full bg-gray-50 border rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 outline-none ${
                idError ? 'border-red-400 focus:ring-red-300' : 'border-gray-200 focus:ring-lodge-accent'
              }`}
            />
            {idError && (
              <p className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-red-600">
                <AlertCircle className="w-3.5 h-3.5" /> {idError}
              </p>
            )}
            {!idError && idNumber && (
              <p className="flex items-center gap-1 mt-1.5 text-[11px] font-semibold text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Valid {idType} number
              </p>
            )}
          </div>
        </div>

        {/* ── ID Document Capture ───────────────────────────────────────── */}
        <div className="border border-gray-100 rounded-xl p-4 space-y-4 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              {idType} Document Upload
            </h4>
            {/* Toggle webcam / upload */}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setCaptureMode('upload')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition ${
                  captureMode === 'upload' ? 'bg-lodge-brown text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Upload className="w-3 h-3" /> Upload File
              </button>
              <button
                type="button"
                onClick={() => setCaptureMode('webcam')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold transition ${
                  captureMode === 'webcam' ? 'bg-lodge-brown text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Camera className="w-3 h-3" /> Webcam
              </button>
            </div>
          </div>

          {captureMode === 'upload' ? (
            <div className={`grid gap-4 ${needsBackSide ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-1 max-w-xs'}`}>
              {/* Front */}
              {frontDoc ? (
                <DocPreviewCard
                  label={needsBackSide ? `${idType} — Front Side` : `${idType} Document`}
                  doc={frontDoc}
                  onRemove={() => setFrontDoc(null)}
                  onReplace={() => frontRef.current?.click()}
                />
              ) : (
                <FileUploadZone
                  label={needsBackSide ? `${idType} Front Side` : `Upload ${idType}`}
                  onFile={handleFrontFile}
                  inputRef={frontRef}
                />
              )}
              <input ref={frontRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) { if (f.size > 10 * 1024 * 1024) return alert('Max 10 MB'); handleFrontFile(f); }
                  e.target.value = '';
                }} />

              {/* Back Side — only for Aadhaar / DL */}
              {needsBackSide && (
                <>
                  {backDoc ? (
                    <DocPreviewCard
                      label={`${idType} — Back Side`}
                      doc={backDoc}
                      onRemove={() => setBackDoc(null)}
                      onReplace={() => backRef.current?.click()}
                    />
                  ) : (
                    <FileUploadZone
                      label={`${idType} Back Side`}
                      onFile={handleBackFile}
                      inputRef={backRef}
                    />
                  )}
                  <input ref={backRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) { if (f.size > 10 * 1024 * 1024) return alert('Max 10 MB'); handleBackFile(f); }
                      e.target.value = '';
                    }} />
                </>
              )}
            </div>
          ) : (
            /* Webcam mode */
            <div className={`grid gap-4 ${needsBackSide ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
              <WebcamCapture
                label={needsBackSide ? `${idType} — Front Side` : `${idType} Capture`}
                onCapture={setWebcamFront}
              />
              {needsBackSide && (
                <WebcamCapture label={`${idType} — Back Side`} onCapture={setWebcamBack} />
              )}
            </div>
          )}
        </div>

        {/* Guest Photo — always webcam */}
        <div className="max-w-xs">
          <WebcamCapture label="Guest Photo (Optional)" onCapture={setWebcamPhoto} />
        </div>
      </div>

      {/* ── Booking Details ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider border-b border-gray-50 pb-2.5">Booking Details</h3>

        <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-500 uppercase">Check-in Time</span>
          <span className="font-bold text-gray-800">{currentTimeStr || 'Calculating...'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Stay Duration</label>
            <select value={stayDuration} onChange={(e) => { setStayDuration(e.target.value); setCustomHours(''); }}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white outline-none">
              <option>12 Hours</option><option>24 Hours</option><option>Custom Hours</option>
            </select>
            {stayDuration === 'Custom Hours' && (
              <input
                type="number"
                required
                min={1}
                max={720}
                value={customHours}
                onChange={(e) => setCustomHours(e.target.value)}
                placeholder="Enter hours (e.g. 6)"
                className="mt-2 w-full bg-gray-50 border border-lodge-accent rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Total Persons <span className="text-[9px] font-semibold text-gray-400 normal-case">(auto from G+L+C)</span>
            </label>
            <div className="w-full bg-gray-100 border border-gray-200 rounded-lg p-2.5 text-sm font-extrabold text-lodge-brown text-center cursor-default select-none">
              {numPersons}
            </div>
          </div>

          {/* G / L / C breakdown */}
          <div className="md:col-span-3">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Person Breakdown &nbsp;<span className="text-gray-400 font-normal normal-case text-[10px]">(G = Gents, L = Ladies, C = Children)</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'G — Gents', val: numGents, set: setNumGents },
                { label: 'L — Ladies', val: numLadies, set: setNumLadies },
                { label: 'C — Children', val: numChildren, set: setNumChildren },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">{label}</label>
                  <input type="number" min={0} max={20} value={val}
                    onChange={(e) => set(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white outline-none text-center font-bold" />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1">
              Total (T) = {(parseInt(numGents||'0') + parseInt(numLadies||'0') + parseInt(numChildren||'0'))} persons
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Purpose of Visit</label>
            <select value={purpose} onChange={(e) => { setPurpose(e.target.value); setCustomPurpose(''); }}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white outline-none">
              <option>Work</option><option>Business</option><option>Tourism</option>
              <option>Medical</option><option>Personal</option><option>Other</option>
            </select>
            {purpose === 'Other' && (
              <input
                type="text"
                required
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                placeholder="Describe purpose of visit"
                className="mt-2 w-full bg-gray-50 border border-lodge-accent rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Arriving From *</label>
            <input type="text" required value={arrivingFrom} onChange={(e) => setArrivingFrom(e.target.value)} placeholder="Origin city/address"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Mode of Travel</label>
            <select value={modeOfTravel} onChange={(e) => { setModeOfTravel(e.target.value); setCustomTravel(''); }}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white outline-none">
              <option>Bus</option><option>Train</option><option>Car</option><option>Other</option>
            </select>
            {modeOfTravel === 'Other' && (
              <input
                type="text"
                required
                value={customTravel}
                onChange={(e) => setCustomTravel(e.target.value)}
                placeholder="Describe mode of travel"
                className="mt-2 w-full bg-gray-50 border border-lodge-accent rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Company Name</label>
            <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Optional"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">GST Number</label>
            <input type="text" value={companyGst} onChange={(e) => setCompanyGst(e.target.value)} placeholder="Optional"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Remarks</label>
          <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Special instructions..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-lodge-accent outline-none" />
        </div>
      </div>

      {/* ── Additional Guests ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-gray-50 pb-2.5">
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
            Additional Guest IDs ({additionalGuests.length})
          </h3>
          <button type="button" onClick={addAdditionalGuest}
            className="flex items-center gap-1 px-3 py-1.5 border border-lodge-accent text-lodge-brown bg-white text-xs font-bold rounded-lg hover:bg-lodge-light transition">
            <Plus className="w-3.5 h-3.5" /> Add Guest
          </button>
        </div>

        {additionalGuests.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4 font-medium">No additional guests added.</p>
        ) : (
          <div className="space-y-6">
            {additionalGuests.map((guest, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-700">Additional Guest {idx + 1}</span>
                  <button type="button" onClick={() => removeAdditionalGuest(idx)}
                    className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 font-bold">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Name *</label>
                    <input type="text" required value={guest.name} onChange={(e) => updateAdditionalGuest(idx, { name: e.target.value })} placeholder="Guest name"
                      className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-medium outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">ID Type *</label>
                    <select value={guest.id_type} onChange={(e) => updateAdditionalGuest(idx, { id_type: e.target.value, id_number: '' })}
                      className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-semibold outline-none">
                      <option value="Aadhaar">Aadhaar</option>
                      <option value="PAN">PAN Card</option>
                      <option value="Passport">Passport</option>
                      <option value="Driving License">Driving License</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      {guest.id_type} Number *
                    </label>
                    <input type="text" required
                      maxLength={idMaxLen[guest.id_type] || 20}
                      value={guest.id_number}
                      onChange={(e) => {
                        let v = e.target.value;
                        if (guest.id_type === 'Aadhaar') v = v.replace(/\D/g, '');
                        if (guest.id_type === 'PAN') v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        updateAdditionalGuest(idx, { id_number: v });
                      }}
                      placeholder={idPlaceholder[guest.id_type] || 'ID Number'}
                      className="w-full bg-white border border-gray-200 rounded-lg p-2 text-xs font-medium outline-none" />
                    {(() => {
                      const e = validateIdNumber(guest.id_type, guest.id_number);
                      return e && guest.id_number ? (
                        <p className="text-[9px] text-red-500 font-semibold mt-1">{e}</p>
                      ) : null;
                    })()}
                  </div>
                </div>
                {/* ── Doc capture for additional guest ── */}
                <div className="space-y-3">
                  {/* Mode toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID Documents</span>
                    <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                      {(['upload','webcam'] as const).map(mode => (
                        <button key={mode} type="button"
                          onClick={() => updateAdditionalGuest(idx, { captureMode: mode })}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-bold transition ${
                            (guest.captureMode||'upload') === mode ? 'bg-lodge-brown text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                          }`}>
                          {mode === 'upload' ? <><Upload className="w-2.5 h-2.5"/>Upload</> : <><Camera className="w-2.5 h-2.5"/>Webcam</>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(guest.captureMode || 'upload') === 'upload' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Front */}
                      {guest.frontPreview || guest.frontFile ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                          <div className="h-20 bg-gray-50 flex items-center justify-center relative">
                            {guest.frontFile?.type === 'application/pdf'
                              ? <FileText className="w-7 h-7 text-red-400"/>
                              : <img src={guest.frontPreview} className="h-full w-full object-cover"/>}
                          </div>
                          <div className="px-2 py-1.5 border-t border-gray-100">
                            <p className="text-[8px] font-bold text-gray-400 uppercase">Front Side</p>
                            <p className="text-[9px] text-gray-500 font-semibold truncate">{guest.frontFile?.name}</p>
                            <button type="button" onClick={() => updateAdditionalGuest(idx,{frontFile:undefined,frontPreview:undefined})}
                              className="text-[8px] text-red-500 font-bold mt-0.5">✕ Remove</button>
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-gray-200 rounded-xl h-24 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-lodge-accent hover:text-lodge-brown transition cursor-pointer bg-gray-50">
                          <Upload className="w-4 h-4"/>
                          <span className="text-[9px] font-bold uppercase">ID Front</span>
                          <span className="text-[8px] text-gray-300">JPG·PNG·PDF 10MB</span>
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf"
                            onChange={async (e) => {
                              const f=e.target.files?.[0]; if(!f)return;
                              if(f.size>10*1024*1024){alert('Max 10MB');return;}
                              const preview=f.type!=='application/pdf'?await new Promise<string>(r=>{const rd=new FileReader();rd.onload=ev=>r(ev.target!.result as string);rd.readAsDataURL(f);}):'';
                              updateAdditionalGuest(idx,{frontFile:f,frontPreview:preview});
                              e.target.value='';
                            }}/>
                        </label>
                      )}

                      {/* Back */}
                      {guest.backPreview || guest.backFile ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                          <div className="h-20 bg-gray-50 flex items-center justify-center">
                            {guest.backFile?.type === 'application/pdf'
                              ? <FileText className="w-7 h-7 text-red-400"/>
                              : <img src={guest.backPreview} className="h-full w-full object-cover"/>}
                          </div>
                          <div className="px-2 py-1.5 border-t border-gray-100">
                            <p className="text-[8px] font-bold text-gray-400 uppercase">Back Side</p>
                            <p className="text-[9px] text-gray-500 font-semibold truncate">{guest.backFile?.name}</p>
                            <button type="button" onClick={() => updateAdditionalGuest(idx,{backFile:undefined,backPreview:undefined})}
                              className="text-[8px] text-red-500 font-bold mt-0.5">✕ Remove</button>
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-gray-200 rounded-xl h-24 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-lodge-accent hover:text-lodge-brown transition cursor-pointer bg-gray-50">
                          <Upload className="w-4 h-4"/>
                          <span className="text-[9px] font-bold uppercase">ID Back</span>
                          <span className="text-[8px] text-gray-300">JPG·PNG·PDF 10MB</span>
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.pdf"
                            onChange={async (e) => {
                              const f=e.target.files?.[0]; if(!f)return;
                              if(f.size>10*1024*1024){alert('Max 10MB');return;}
                              const preview=f.type!=='application/pdf'?await new Promise<string>(r=>{const rd=new FileReader();rd.onload=ev=>r(ev.target!.result as string);rd.readAsDataURL(f);}):'';
                              updateAdditionalGuest(idx,{backFile:f,backPreview:preview});
                              e.target.value='';
                            }}/>
                        </label>
                      )}

                      {/* Photo */}
                      {guest.photoPreview || guest.photoFile ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                          <div className="h-20 bg-gray-50 flex items-center justify-center">
                            <img src={guest.photoPreview} className="h-full w-full object-cover"/>
                          </div>
                          <div className="px-2 py-1.5 border-t border-gray-100">
                            <p className="text-[8px] font-bold text-gray-400 uppercase">Guest Photo</p>
                            <p className="text-[9px] text-gray-500 font-semibold truncate">{guest.photoFile?.name}</p>
                            <button type="button" onClick={() => updateAdditionalGuest(idx,{photoFile:undefined,photoPreview:undefined})}
                              className="text-[8px] text-red-500 font-bold mt-0.5">✕ Remove</button>
                          </div>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-gray-200 rounded-xl h-24 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-lodge-accent hover:text-lodge-brown transition cursor-pointer bg-gray-50">
                          <Upload className="w-4 h-4"/>
                          <span className="text-[9px] font-bold uppercase">Guest Photo</span>
                          <span className="text-[8px] text-gray-300">JPG·PNG 10MB</span>
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png"
                            onChange={async (e) => {
                              const f=e.target.files?.[0]; if(!f)return;
                              if(f.size>10*1024*1024){alert('Max 10MB');return;}
                              const preview=await new Promise<string>(r=>{const rd=new FileReader();rd.onload=ev=>r(ev.target!.result as string);rd.readAsDataURL(f);});
                              updateAdditionalGuest(idx,{photoFile:f,photoPreview:preview});
                              e.target.value='';
                            }}/>
                        </label>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <WebcamCapture label="ID Front Side" onCapture={(b) => updateAdditionalGuest(idx, { webcam_front_id: b })} />
                      <WebcamCapture label="ID Back Side" onCapture={(b) => updateAdditionalGuest(idx, { webcam_back_id: b })} />
                      <WebcamCapture label="Guest Photo" onCapture={(b) => updateAdditionalGuest(idx, { webcam_guest_photo: b })} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Submit Buttons ───────────────────────────────────────────────── */}
      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onCancel}
          className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-lg text-sm font-semibold hover:bg-gray-50 transition">
          Cancel
        </button>
        <button type="submit" disabled={loading || !!idError}
          className="flex-1 py-3 bg-orange-700 text-white rounded-lg text-sm font-semibold hover:bg-orange-800 transition disabled:opacity-50 shadow">
          {loading ? 'Performing Check-In...' : 'Check In & Create Invoice'}
        </button>
      </div>
    </form>
  );
}
