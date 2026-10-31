# 실행 파일에 버전 정보(회사·제품·파일 설명) 리소스를 넣는다. 엔진이 만든 C++ 작업 exe(Binaries/*.exe)는 이 정보도 서명도 없어서
# Windows 보안(Defender)이 기계학습 판정(Program:Win32/Contebrew.A!ml)으로 다른 PC에서 지워 게임이 흰 화면 뒤 꺼졌음 (2026-10-31)
# 실행: powershell -File tools/set_exe_info.ps1 <exe> <파일 설명>
param([string]$Exe, [string]$Description)
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Text;using System.Runtime.InteropServices;
public static class ExeInfo{
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr BeginUpdateResource(string f,bool del);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateResource(IntPtr h,IntPtr type,IntPtr name,ushort lang,byte[] data,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool EndUpdateResource(IntPtr h,bool discard);
  static void Pad(BinaryWriter w){while(w.BaseStream.Position%4!=0)w.Write((byte)0);}
  // VS_VERSIONINFO 구조: 블록마다 길이·값 길이·종류(1=문자열)·키, 4바이트 정렬
  static byte[] Block(string key,byte[] value,int valueLen,int type,byte[][] children){
    var m=new MemoryStream();var w=new BinaryWriter(m);
    w.Write((ushort)0);w.Write((ushort)valueLen);w.Write((ushort)type);w.Write(Encoding.Unicode.GetBytes(key+"\0"));Pad(w);
    if(value!=null){w.Write(value);Pad(w);}
    foreach(var c in children){w.Write(c);Pad(w);}
    var b=m.ToArray();BitConverter.GetBytes((ushort)b.Length).CopyTo(b,0);return b;
  }
  static byte[] Str(string k,string v){var b=Encoding.Unicode.GetBytes(v+"\0");return Block(k,b,v.Length+1,1,new byte[0][]);}
  public static void Set(string exe,string desc){
    var fixedInfo=new MemoryStream();var f=new BinaryWriter(fixedInfo);
    f.Write(0xFEEF04BDu);f.Write(0x00010000u);f.Write(0x00010000u);f.Write(0u);f.Write(0x00010000u);f.Write(0u);
    f.Write(0x3Fu);f.Write(0u);f.Write(0x40004u);f.Write(1u);f.Write(0u);f.Write(0u);f.Write(0u);
    var strings=Block("041204b0",null,0,1,new[]{Str("CompanyName","Mastiff"),Str("FileDescription",desc),Str("FileVersion","1.0.0.0"),
      Str("InternalName","AuricLoop"),Str("LegalCopyright","Copyright (C) 2026 Mastiff"),Str("OriginalFilename",Path.GetFileName(exe)),
      Str("ProductName","Auric Loop"),Str("ProductVersion","1.0.0.0")});
    var sfi=Block("StringFileInfo",null,0,1,new[]{strings});
    var vfi=Block("VarFileInfo",null,0,1,new[]{Block("Translation",new byte[]{0x12,0x04,0xB0,0x04},4,0,new byte[0][])});
    var root=Block("VS_VERSION_INFO",fixedInfo.ToArray(),52,0,new[]{sfi,vfi});
    var h=BeginUpdateResource(exe,false);if(h==IntPtr.Zero)throw new Exception("BeginUpdateResource "+Marshal.GetLastWin32Error());
    if(!UpdateResource(h,(IntPtr)16,(IntPtr)1,0x0412,root,(uint)root.Length))throw new Exception("RT_VERSION "+Marshal.GetLastWin32Error());
    if(!EndUpdateResource(h,false))throw new Exception("EndUpdateResource "+Marshal.GetLastWin32Error());
  }
}
'@
[ExeInfo]::Set($Exe, $Description)
