# Game.exe의 아이콘 리소스(그룹 101, 아이콘 1~)를 .ico 파일 내용으로 바꾼다. 엔진 플레이어 exe엔 게임별 아이콘을 넣는 기능이 없음
# 실행: powershell -File tools/set_exe_icon.ps1 <exe> <ico>
param([string]$Exe, [string]$Ico)
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Runtime.InteropServices;
public static class ExeIcon{
  [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern IntPtr BeginUpdateResource(string f,bool del);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateResource(IntPtr h,IntPtr type,IntPtr name,ushort lang,byte[] data,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool EndUpdateResource(IntPtr h,bool discard);
  public static void Set(string exe,string ico,ushort group){
    var b=File.ReadAllBytes(ico);int n=BitConverter.ToUInt16(b,4);
    var h=BeginUpdateResource(exe,false);if(h==IntPtr.Zero)throw new Exception("BeginUpdateResource "+Marshal.GetLastWin32Error());
    var dir=new MemoryStream();var w=new BinaryWriter(dir);w.Write((ushort)0);w.Write((ushort)1);w.Write((ushort)n);
    for(int i=0;i<n;i++){int o=6+16*i;int size=BitConverter.ToInt32(b,o+8),off=BitConverter.ToInt32(b,o+12);
      var img=new byte[size];Array.Copy(b,off,img,0,size);
      if(!UpdateResource(h,(IntPtr)3,(IntPtr)(i+1),1033,img,(uint)size))throw new Exception("RT_ICON "+Marshal.GetLastWin32Error());
      w.Write(b,o,12);w.Write((ushort)(i+1));}
    var g=dir.ToArray();
    if(!UpdateResource(h,(IntPtr)14,(IntPtr)group,1033,g,(uint)g.Length))throw new Exception("RT_GROUP_ICON "+Marshal.GetLastWin32Error());
    if(!EndUpdateResource(h,false))throw new Exception("EndUpdateResource "+Marshal.GetLastWin32Error());
  }
}
'@
[ExeIcon]::Set($Exe, $Ico, 101)
