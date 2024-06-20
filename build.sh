echo "Build started at $(date)"
bun build --compile --sourcemap=inline --minify --target=bun-windows-x64 entry.ts --outfile ./builds/windows/x64/xavier
bun build --compile --sourcemap=inline --minify --target=bun-linux-arm64 entry.ts --outfile ./builds/linux/arm64/xavier
bun build --compile --sourcemap=inline --minify --target=bun-linux-x64 entry.ts --outfile ./builds/linux/x64/xavier
bun build --compile --sourcemap=inline --minify --target=bun-darwin-arm64 entry.ts --outfile ./builds/darwin/arm64/xavier 
echo "Build completed at $(date)"
