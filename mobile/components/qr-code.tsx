import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Rect } from "react-native-svg";

/**
 * A QR code, drawn as squares rather than fetched as an image.
 *
 * The secret in it is the account's second factor, so it must not leave the
 * phone: no image service, no network at all. qrcode-generator is pure
 * JavaScript and builds the module grid in memory, and react-native-svg draws
 * it, so the code is rendered from nothing but the string and never travels.
 */
export function QRCode({ value, size = 220 }: { value: string; size?: number }) {
  const { count, cells } = useMemo(() => {
    // Type 0 lets the library pick the smallest version that fits; error
    // correction M is the usual choice for an otpauth string this length.
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();

    const n = qr.getModuleCount();
    const dark: { r: number; c: number }[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) dark.push({ r, c });
      }
    }
    return { count: n, cells: dark };
  }, [value]);

  // A quiet zone of one module each side, so a reader can find the edges.
  const modules = count + 2;
  const unit = size / modules;

  return (
    <View style={{ backgroundColor: "#FFFFFF", padding: unit, borderRadius: 12 }}>
      <Svg width={size - unit * 2} height={size - unit * 2} viewBox={`0 0 ${count} ${count}`}>
        {cells.map(({ r, c }) => (
          <Rect key={`${r}-${c}`} x={c} y={r} width={1.02} height={1.02} fill="#000000" />
        ))}
      </Svg>
    </View>
  );
}
