// Fenwick sums keep row measurement updates logarithmic, including 100000-row lists.
export class MeasuredListLayout{
 constructor(base,cache=new Map()){this.rows=base.rows.map(row=>({...row,height:cache.get(row.key)??row.height}));this.parents=base.parents;this.sums=new Float64Array(this.rows.length+1);for(let i=1;i<this.sums.length;i++){this.sums[i]+=this.rows[i-1].height;const parent=i+(i&-i);if(parent<this.sums.length)this.sums[parent]+=this.sums[i];}}
 offset(index){let sum=0;for(let i=Math.max(0,Math.min(index,this.rows.length));i>0;i-=i&-i)sum+=this.sums[i];return sum;}
 get total(){return this.offset(this.rows.length);}
 measure(index,height){if(!Number.isInteger(index)||!this.rows[index]||!Number.isFinite(height)||height<8||height>4096)throw Error('측정 행 높이를 확인하세요.');const delta=height-this.rows[index].height;if(Math.abs(delta)<.25)return false;this.rows[index].height=height;for(let i=index+1;i<this.sums.length;i+=i&-i)this.sums[i]+=delta;return true;}
 at(y){if(!this.rows.length)return 0;let index=0,sum=0,bit=2**Math.floor(Math.log2(this.rows.length));for(;bit;bit>>=1){const next=index+bit;if(next<this.sums.length&&sum+this.sums[next]<=y){sum+=this.sums[next];index=next;}}return Math.min(this.rows.length-1,index);}
 range(y,height){if(!this.rows.length)return{start:0,end:0};return{start:Math.max(0,this.at(y)-2),end:Math.min(this.rows.length,this.at(y+height)+3)};}
}
