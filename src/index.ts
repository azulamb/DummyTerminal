interface DummyTerminalInterface
{
	write( data: string, wait?: number ): Promise<void>;
	print( x: number, y: number, data: string ): void;
	clear(): void;
}

interface DummyTerminalOption
{
	font?: { size: string, family?: string },
	char?: { width: string, height: string },
	terminal?: { back: string, front: string, time?: number },
	cursor?: {},
}

const DummyTerminalLibs =
{
	splitString: ( data: string ) => { return Array.from( data ); },
	isHankaku: ( char: string ) => { return !char.match( /[^\x01-\x7E]/ ) || !char.match( /[^\uFF65-\uFF9F]/ ); },
};

function Wait( time: number ) { return new Promise<void>( ( resolve ) => { setTimeout( () => { resolve(); }, time ); } ); }

function WaitFunc( time: number ) { return () => { return Wait( time ); }; }

function InitDummyTerminal( tagname = 'dummy-terminal' )
{
	interface PromiseTimerData
	{
		promise: Promise<void>;
		resolve: () => void;
		reject: () => void;
	}

	function PromiseTimer( callback: () => boolean, time: number, after?: () => void )
	{
		const data: PromiseTimerData = {
			promise: <any>null,
			resolve: () => {},
			reject: () => {},
		};

		data.promise = new Promise( ( resolve, reject ) =>
		{
			let timer = 0;
			data.resolve = resolve;
			data.reject = () => { clearTimeout( timer ); if ( after ) { after(); } reject(); };
			const MyTimer = () =>
			{
				timer = setTimeout( () =>
				{
					if ( callback() ) { MyTimer(); return; }
					if ( after ) { after(); }
					resolve();
				}, time );
			};
			MyTimer();
		} );

		return data;
	}

	class TerminalElement extends HTMLElement implements DummyTerminalInterface
	{
		protected shadow: ShadowRoot;
		protected width: number;
		protected height: number;
		private chars: string[];
		private timer: PromiseTimerData;
		private writeTime: number;

		constructor( width: number, height: number, option?: DummyTerminalOption )
		{
			super();
			this.chars = [];
			this.writeTime = 100;

			this.shadow = this.attachShadow( { mode: 'open' } );

			this.width = width;
			this.height = height;

			if ( option && option.terminal && typeof option.terminal.time === 'number' && 0 < option.terminal.time )
			{
				this.writeTime = option.terminal.time;
			}

			this.init( option );
		}

		protected init( option?: DummyTerminalOption ){}

		public put( char: string ) {}

		public write( data: string, wait?: number )
		{
			this.chars = this.chars.concat( DummyTerminalLibs.splitString( data ) );

			if ( this.timer ) { return this.timer.promise; }

			const time = wait === undefined ? this.writeTime : wait;

			if ( 0 < time )
			{
				this.timer = PromiseTimer( () =>
				{
					const char = this.chars.shift();
					if ( !char ) { return false; }
					this.put( char );
					return true;
				}, this.writeTime, () => { this.timer = <any>null; } );
			} else
			{
				this.timer = PromiseTimer( () =>
				{
					this.chars.forEach( ( char ) => { this.put( char ); } );
					this.chars = [];
					return false;
				}, 0, () => { this.timer = <any>null; } );
			}
			return this.timer.promise;
		}

		public print( x: number, y: number, data: string ) {}

		public clear()
		{
			if ( this.timer )
			{
				this.timer.reject();
				this.timer = <any>null;
				this.chars = [];
			}
		}
	}

	class HTMLTerminal extends TerminalElement
	{

		private area: HTMLElement;
		private cursor: HTMLElement;

		protected init( option?: DummyTerminalOption )
		{
			const size = option && option.font && option.font.size ? option.font.size : '1em';
			const family = option && option.font && option.font.family ? option.font.family : 'monospace';
			const width = option && option.char && option.char.width ? option.char.width : '0.6em';
			const height = option && option.char && option.char.height ? option.char.height : '1.2em';
			const front = option && option.terminal && option.terminal.front ? option.terminal.front : '#4af755';
			const back = option && option.terminal && option.terminal.front ? option.terminal.back : '#353235';

			const style = document.createElement( 'style' );
			style.textContent  =
			[
				':host{font-family:'+family+';font-size:'+size+';color:'+front+';}',
				':host > div{display:block;position:relative;overflow:hidden;width:calc('+width+'*'+this.width+');height:calc('+height+'*'+this.height+');background-color:'+back+';}',
				':host > div > div{display:block;position:absolute;bottom:0;width:100%;min-height:100%;}',
				'div > span{display:block;float:left;overflow:hidden;text-align:center;width:'+width+';height:'+height+';line-height:'+height+';text-shadow: 0px 0px 5px '+front+';}',
				'div > span.w{width:calc('+width+'*2);}',
				'div > span.n{clear:both;width:0;}',
				'div > span.cursor{background-color:'+front+';box-shadow: 0 0 5px '+front+';opacity:1;}',
				'div > span.cursor:not(.move){animation:BLINK 0.5s cubic-bezier(1,.01,1,.61) infinite alternate;}',
				'@keyframes BLINK{0%{opacity:1.0;}100% {opacity:0;}}',
			].join('');
			this.shadow.appendChild( style );

			this.area = document.createElement( 'div' );
			this.cursor = document.createElement( 'span' );
			this.cursor.classList.add( 'cursor' );
			this.area.appendChild( this.cursor );

			const parent = document.createElement( 'div' );
			parent.appendChild( this.area );
			this.shadow.appendChild( parent );

		}

		public put( char: string )
		{
			const c = document.createElement( 'span' );
			if ( char === '\n' )
			{
				c.classList.add( 'n' );
			} else
			{
				c.textContent = char;
			}
			if ( !DummyTerminalLibs.isHankaku( char ) )
			{
				c.classList.add( 'w' );
			}
			this.area.insertBefore( c, this.cursor );
		}

		public write( data: string, wait?: number )
		{
			this.cursor.classList.add( 'move' );
			return super.write( data, wait ).catch( () => {} ).then( () => { this.cursor.classList.remove( 'move' ); } );
		}

		public clear()
		{
			super.clear();

			const children = this.area.children;
			for ( let i = children.length - 1 ; 0 <= i ; --i )
			{
				this.area.removeChild( children[ i ] );
			}
			this.cursor = document.createElement( 'span' );
			this.cursor.classList.add( 'cursor' );
			this.area.appendChild( this.cursor );
		}
	}

	class DummyTerminal extends HTMLElement implements DummyTerminalInterface
	{
		/*static get observedAttributes()
		{
			return [ 'width' ];
		}*/

		private shadow: ShadowRoot;
		private terminal: TerminalElement;

		constructor()
		{
			super();

			const option: DummyTerminalOption = {};

			if ( this.hasAttribute( 'size' ) )
			{
				option.font =
				{
					size: this.getAttribute( 'size' ) || '',
				};
			}
			if ( this.hasAttribute( 'family' ) )
			{
				if ( !option.font ) { option.font = { size: '' }; }
				option.font.family = this.getAttribute( 'family' ) || '';
			}
			if ( this.hasAttribute( 'front' ) )
			{
				option.terminal =
				{
					front: this.getAttribute( 'front' ) || '',
					back: '',
				};
			}
			if ( this.hasAttribute( 'back' ) )
			{
				if ( !option.terminal ) { option.terminal = { front: '', back: '' }; }
				option.terminal.back = this.getAttribute( 'back' ) || '';
			}

			let cols = 80;
			let rows = 24;

			if ( this.getAttribute( 'mode' ) === 'canvas' )
			{
				// Canvas Mode.
				this.terminal = new TerminalElement( cols, rows, option );// TODO: CanvasTerminal
			} else
			{
				// HTML Mode.
				this.terminal = new HTMLTerminal( cols, rows, option );
			}

			this.shadow = this.attachShadow( { mode: 'open' } );

			const style = document.createElement( 'style' );
			style.textContent =
			[
				':host{display:block;width:fit-content;height:fit-content;}'
			].join( '' );

			this.shadow.appendChild( style );
			this.shadow.appendChild( this.terminal );
		}

		public write( data: string, wait?: number ) { return this.terminal.write( data, wait ); }

		public print( x: number, y: number, data: string ) { return this.terminal.print( x, y, data ); }

		public clear() { return this.terminal.clear(); }
	}

	customElements.define( tagname + 'html', HTMLTerminal );

	customElements.define( tagname, DummyTerminal );
}

document.addEventListener( 'DOMContentLoaded', () => { InitDummyTerminal(); } );
