// 기상청 API 프록시 — API 키를 서버(환경변수)에만 보관
// Netlify 환경변수 KMA_KEY 에 공공데이터포털 인증키를 설정하세요.
const ALLOWED = {
  vilage:  'VilageFcstInfoService_2.0/getVilageFcst',
  midLand: 'MidFcstInfoService/getMidLandFcst',
  midTa:   'MidFcstInfoService/getMidTa',
};

exports.handler = async (event) => {
  const KEY = process.env.KMA_KEY;
  if (!KEY) return { statusCode: 500, body: JSON.stringify({ error: 'KMA_KEY 환경변수가 설정되지 않았습니다' }) };

  const { service, ...params } = event.queryStringParameters || {};
  const path = ALLOWED[service];
  if (!path) return { statusCode: 400, body: JSON.stringify({ error: 'invalid service' }) };

  // 허용된 파라미터만 전달
  const SAFE = ['pageNo','numOfRows','base_date','base_time','nx','ny','regId','tmFc'];
  const qs = new URLSearchParams({ serviceKey: KEY, dataType: 'JSON' });
  for (const k of SAFE) if (params[k] != null) qs.set(k, params[k]);

  try {
    const r = await fetch(`https://apis.data.go.kr/1360000/${path}?${qs}`);
    const body = await r.text();
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' },
      body,
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: String(e) }) };
  }
};
