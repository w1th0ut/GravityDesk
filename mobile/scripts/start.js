const { spawn } = require('child_process');
const os = require('os');

function getTailscaleOrLanIp() {
  const ifaces = os.networkInterfaces();
  const tailscaleCandidates = [];
  const lanCandidates = [];
  const otherCandidates = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    const lname = name.toLowerCase();
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' && addr.family !== 4) continue;
      const ip = addr.address;
      if (ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

      if (lname.includes('tailscale') || ip.startsWith('100.')) {
        tailscaleCandidates.push(ip);
      } else if (lname.includes('wi-fi') || lname.includes('ethernet') || lname.includes('wlan')) {
        lanCandidates.push(ip);
      } else {
        otherCandidates.push(ip);
      }
    }
  }

  if (tailscaleCandidates.length > 0) return tailscaleCandidates[0];
  if (lanCandidates.length > 0) return lanCandidates[0];
  if (otherCandidates.length > 0) return otherCandidates[0];
  return '127.0.0.1';
}

const targetIp = getTailscaleOrLanIp();
console.log(`\x1b[36m[GravityDesk]\x1b[0m Binding Metro bundler to IP: \x1b[32m${targetIp}\x1b[0m`);
process.env.REACT_NATIVE_PACKAGER_HOSTNAME = targetIp;

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';
const args = ['expo', 'start', ...process.argv.slice(2)];

const child = spawn(npxCmd, args, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
