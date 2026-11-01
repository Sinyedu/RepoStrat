// Some restricted Windows environments deny the userInfo syscall used by tsx.
// Supply the username needed for its temporary directory only in that case.
const os = require('node:os');

if (process.platform === 'win32') {
  try {
    os.userInfo();
  } catch (error) {
    if (error.syscall !== 'uv_os_get_passwd') throw error;
    os.userInfo = () => ({
      username: process.env.USERNAME || 'repostrat',
      uid: -1,
      gid: -1,
      shell: null,
      homedir: os.homedir(),
    });
  }
}
