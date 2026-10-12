import { mkdir, open, readFile, rename, rm, lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
async function windowsPrivate(path, directory) {
  if (process.platform !== "win32") return;
  const system = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  // Set a fresh protected DACL in one operation; never temporarily reset to inherited permissions.
  const script = [
    '$ErrorActionPreference="Stop"',
    "$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User",
    '$acl=if($env:ABEI_ACL_DIRECTORY -eq "1"){New-Object System.Security.AccessControl.DirectorySecurity}else{New-Object System.Security.AccessControl.FileSecurity}',
    "$acl.SetOwner($sid)",
    "$acl.SetAccessRuleProtection($true,$false)",
    '$inherit=if($env:ABEI_ACL_DIRECTORY -eq "1"){[System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"}else{[System.Security.AccessControl.InheritanceFlags]::None}',
    '$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,"FullControl",$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow)',
    "$acl.AddAccessRule($rule)",
    "Set-Acl -LiteralPath $env:ABEI_ACL_TARGET -AclObject $acl",
  ].join(";");
  await run(
    join(system, "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      windowsHide: true,
      env: {
        ...process.env,
        ABEI_ACL_TARGET: path,
        ABEI_ACL_DIRECTORY: directory ? "1" : "0",
      },
    },
  );
}
export class PrivateStore {
  constructor(root, profile) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(profile)) throw Error("客户端标识无效");
    this.dir = join(root, profile);
    this.path = join(this.dir, "state.json");
  }
  async prepare() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const s = await lstat(this.dir);
    if (
      s.isSymbolicLink() ||
      !s.isDirectory() ||
      (process.platform !== "win32" &&
        (s.mode & 0o077 || (process.getuid && s.uid !== process.getuid())))
    )
      throw Error("授权目录必须为当前用户私有目录（0700）");
    await windowsPrivate(this.dir, true);
  }
  async read() {
    try {
      const s = await lstat(this.path);
      if (
        !s.isFile() ||
        s.isSymbolicLink() ||
        (process.platform !== "win32" &&
          (s.mode & 0o077 || (process.getuid && s.uid !== process.getuid())))
      )
        throw Error("授权文件权限必须为0600");
      await windowsPrivate(this.path, false);
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return { version: 1 };
      throw e;
    }
  }
  async write(value) {
    await this.prepare();
    const temp = join(this.dir, `.state-${randomUUID()}`);
    const file = await open(temp, "wx", 0o600);
    try {
      await windowsPrivate(temp, false);
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temp, this.path);
    } finally {
      await rm(temp, { force: true });
    }
  }
  async lock(fn, signal) {
    await this.prepare();
    const lock = join(this.dir, "lock");
    for (let i = 0; i < 200; i++) {
      signal?.throwIfAborted();
      let acquired = false;
      try {
        await mkdir(lock, { mode: 0o700 });
        acquired = true;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
      if (acquired) {
        try {
          await writeOwner(lock);
          return await fn();
        } finally {
          await rm(lock, { recursive: true, force: true });
        }
      }
      try {
        const owner = JSON.parse(await readFile(join(lock, "owner"), "utf8"));
        try {
          process.kill(owner.pid, 0);
        } catch (dead) {
          if (dead.code === "ESRCH")
            await rm(lock, { recursive: true, force: true });
        }
      } catch (e) {
        if (e.code === "ENOENT") {
          try {
            if (Date.now() - (await lstat(lock)).mtimeMs > 30000)
              await rm(lock, { recursive: true, force: true });
          } catch {}
        }
      }
      await delay(25, undefined, { signal });
    }
    throw Error("授权状态正在由另一进程更新，请稍后重试");
  }
}
async function writeOwner(lock) {
  const f = await open(join(lock, "owner"), "wx", 0o600);
  try {
    await f.writeFile(JSON.stringify({ pid: process.pid }));
  } finally {
    await f.close();
  }
}
