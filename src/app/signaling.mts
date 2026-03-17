/** ICE candidate 情報。 */
export interface SignalingCandidate {
  candidate: string;
  mid: string;
}

/** SDP と ICE candidate をまとめたシグナリング情報。 */
export interface SignalingData {
  sdp: string;
  type: 'offer' | 'answer';
  candidates: SignalingCandidate[];
}

export function encodeSignaling(data: SignalingData): string {
  return Buffer.from(JSON.stringify(data), 'utf-8').toString('base64');
}

export function decodeSignaling(encoded: string): SignalingData {
  let decoded: string;
  let parsed: unknown;

  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    throw new Error('Invalid base64 signaling data');
  }

  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('Invalid JSON signaling data');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Signaling data must be an object');
  }

  const candidateData = (parsed as Partial<SignalingData>).candidates;
  const typeData = (parsed as Partial<SignalingData>).type;
  const sdpData = (parsed as Partial<SignalingData>).sdp;

  if (typeof sdpData !== 'string' || sdpData.length === 0) {
    throw new Error('Signaling data.sdp is required');
  }

  if (typeData !== 'offer' && typeData !== 'answer') {
    throw new Error('Signaling data.type must be offer or answer');
  }

  if (!Array.isArray(candidateData)) {
    throw new Error('Signaling data.candidates must be an array');
  }

  for (const candidate of candidateData) {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Signaling candidate must be an object');
    }
    const item = candidate as Partial<SignalingCandidate>;
    if (typeof item.candidate !== 'string' || typeof item.mid !== 'string') {
      throw new Error('Signaling candidate must include candidate and mid');
    }
  }

  return {
    sdp: sdpData,
    type: typeData,
    candidates: candidateData,
  };
}