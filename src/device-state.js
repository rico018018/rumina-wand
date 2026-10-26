/** UI reflects acquisition callbacks, not just a request to start listening. */
export function deviceState(kind, source) {
  if (kind === 'camera') {
    if (source.active) return {label:'ON・検知中',tone:'on',enabled:true,action:'OFFにする'};
    if (source.starting) return {label:'許可・準備待ち',tone:'pending',enabled:true,action:'キャンセル'};
    if (source.error) return {label:'OFF・エラー',tone:'error',enabled:false,action:'もう一度ON'};
    return {label:'OFF',tone:'off',enabled:false,action:'ONにする'};
  }
  if (!source.support?.hasApi) return {label:'非対応',tone:'error',enabled:false,action:'手動で遊べます',disabled:true};
  if (source.stopping) return {label:'停止中',tone:'pending',enabled:false,action:'停止を待っています',disabled:true};
  if (source.audioActive) return {label:source.state==='suppressed'?'ON・入力無視':'ON・集音中',tone:'on',enabled:true,action:'OFFにする'};
  if (source.error) return {label:'OFF・エラー',tone:'error',enabled:source.wantListening,action:source.wantListening?'OFFにする':'もう一度ON'};
  if (source.startPending) return {label:'開始・許可待ち',tone:'pending',enabled:true,action:'キャンセル'};
  if (source.state==='suppressed' && source.wantListening) return {label:'一時停止',tone:'pending',enabled:true,action:'自動再開をOFF'};
  if (source.wantListening) return {label:'接続・再開待ち',tone:'pending',enabled:true,action:'OFFにする'};
  return {label:'OFF',tone:'off',enabled:false,action:'ONにする'};
}
