/** True in a browser (the phone), false inside the Mac app. Set by installWeb
 *  before anything else loads; the Mac app's preload provides window.prep itself. */
export const isWebClient = (window as unknown as { __prepWeb?: boolean }).__prepWeb === true
