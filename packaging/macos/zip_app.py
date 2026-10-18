#!/usr/bin/env python3
"""Pack a .app into a zip that keeps Unix executable bits (create_system = Unix)."""

import argparse
import os
import stat
import sys
import time
import zipfile

REQUIRED = (
    "Cursor 汉化.app/Contents/Info.plist",
    "Cursor 汉化.app/Contents/MacOS/launcher",
    "Cursor 汉化.app/Contents/Resources/scripts/gui.sh",
    "Cursor 汉化.app/Contents/Resources/scripts/find-cursor.sh",
    "Cursor 汉化.app/Contents/Resources/scripts/watch.sh",
    "Cursor 汉化.app/Contents/Resources/pack/bin/cursor-zh.js",
    "Cursor 汉化.app/Contents/Resources/pack/src/cli.js",
    "Cursor 汉化.app/Contents/Resources/pack/dictionary/exact.json",
    "Cursor 汉化.app/Contents/Resources/node/arm64/node",
    "Cursor 汉化.app/Contents/Resources/node/x64/node",
)

EXECUTABLE = (
    "Cursor 汉化.app/Contents/MacOS/launcher",
    "Cursor 汉化.app/Contents/Resources/node/arm64/node",
    "Cursor 汉化.app/Contents/Resources/node/x64/node",
)

MACHO_MAGICS = {
    0xFEEDFACE,
    0xFEEDFACF,
    0xCEFAEDFE,
    0xCFFAEDFE,
    0xCAFEBABE,
    0xBEBAFECA,
}


def unix_mode(info):
    return (info.external_attr >> 16) & 0xFFFF


def add_bytes(zf, arcname, data, mode, mtime):
    info = zipfile.ZipInfo(arcname)
    info.create_system = 3
    info.flag_bits |= 0x800
    info.external_attr = (mode & 0xFFFF) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    info.date_time = time.localtime(mtime)[:6]
    zf.writestr(info, data)


def add_tree(zf, root, prefix):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()
        rel = os.path.relpath(dirpath, root)
        if rel == ".":
            arc_dir = prefix
        else:
            arc_dir = prefix + "/" + rel.replace(os.sep, "/")
        st = os.lstat(dirpath)
        folder = arc_dir if arc_dir.endswith("/") else arc_dir + "/"
        add_bytes(zf, folder, b"", st.st_mode, st.st_mtime)
        for name in filenames:
            full = os.path.join(dirpath, name)
            st_file = os.lstat(full)
            if stat.S_ISLNK(st_file.st_mode):
                raise SystemExit(f"refusing to pack a symlink: {full}")
            arc = folder.rstrip("/") + "/" + name
            with open(full, "rb") as handle:
                data = handle.read()
            add_bytes(zf, arc, data, st_file.st_mode, st_file.st_mtime)


def pack(app_path, dest):
    prefix = os.path.basename(app_path.rstrip("/"))
    with zipfile.ZipFile(dest, "w") as zf:
        add_tree(zf, app_path, prefix)


def is_macho(data):
    if len(data) < 4:
        return False
    return int.from_bytes(data[:4], "big") in MACHO_MAGICS


def check(dest, require_macho):
    with zipfile.ZipFile(dest) as zf:
        names = set(zf.namelist())
        missing = [item for item in REQUIRED if item not in names]
        if missing:
            raise SystemExit("zip 缺少文件: " + ", ".join(missing))
        plist = zf.read("Cursor 汉化.app/Contents/Info.plist").decode("utf-8")
        if "<string>launcher</string>" not in plist or "CFBundleExecutable" not in plist:
            raise SystemExit("Info.plist 没有把启动程序设为 launcher")
        if "Cursor 汉化" not in plist:
            raise SystemExit("Info.plist 没有应用名称")
        for item in EXECUTABLE:
            info = zf.getinfo(item)
            mode = unix_mode(info)
            if info.create_system != 3:
                raise SystemExit(f"{item} create_system={info.create_system}，不是 Unix")
            if mode & 0o111 == 0:
                raise SystemExit(f"{item} 没有可执行位，mode={oct(mode)}")
            if require_macho and item.endswith("/node"):
                if not is_macho(zf.read(item)[:4]):
                    raise SystemExit(f"{item} 不是 Mach-O")
        launcher = zf.getinfo("Cursor 汉化.app/Contents/MacOS/launcher")
        print(f"launcher mode {oct(unix_mode(launcher))}")
    print("zip ok")


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--require-macho", action="store_true")
    args = parser.parse_args(argv)
    if args.check:
        if len(args.inputs) != 1:
            raise SystemExit("用法: zip_app.py --check ZIP")
        check(args.inputs[0], args.require_macho)
        return 0
    if len(args.inputs) != 2:
        raise SystemExit("用法: zip_app.py APP_DIR ZIP")
    pack(args.inputs[0], args.inputs[1])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
